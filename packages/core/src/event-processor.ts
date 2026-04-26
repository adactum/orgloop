/**
 * EventProcessor — pipeline owner for a single inbound event.
 *
 * Extracted verbatim from Runtime.processEvent so the runtime no longer
 * carries event-pipeline state. Stats live on the per-module
 * RouteStatsStore (accessed via the `mod` argument); metrics now carry the
 * owning module label.
 */

import type { LogEntry, LogPhase, OrgLoopEvent, RouteRef } from '@orgloop/sdk';
import type { EventBus } from './bus.js';
import type { EventHistory, EventRecord } from './event-history.js';
import type { LoggerManager } from './logger.js';
import { buildLogEntry } from './logger.js';
import type { LoopDetector } from './loop-detector.js';
import type { MetricsServer } from './metrics.js';
import type { ModuleInstance } from './module-instance.js';
import type { DispatchResult, RouteDispatcher } from './route-dispatcher.js';
import { matchRoutes } from './router.js';
import { executeTransformPipeline, type TransformPipelineOptions } from './transform.js';

export interface EventProcessorDeps {
	loopDetector: LoopDetector;
	bus: EventBus;
	eventHistory: EventHistory;
	metricsServer: MetricsServer | null;
	routeDispatcher: RouteDispatcher;
	logSink: LoggerManager;
	emitter: {
		emit(event: string, data: unknown): void;
	};
}

export class EventProcessor {
	private readonly loopDetector: LoopDetector;
	private readonly bus: EventBus;
	private readonly eventHistory: EventHistory;
	private readonly metricsServer: MetricsServer | null;
	private readonly routeDispatcher: RouteDispatcher;
	private readonly logSink: LoggerManager;
	private readonly emitter: EventProcessorDeps['emitter'];

	constructor(deps: EventProcessorDeps) {
		this.loopDetector = deps.loopDetector;
		this.bus = deps.bus;
		this.eventHistory = deps.eventHistory;
		this.metricsServer = deps.metricsServer;
		this.routeDispatcher = deps.routeDispatcher;
		this.logSink = deps.logSink;
		this.emitter = deps.emitter;
	}

	async processEvent(event: OrgLoopEvent, mod: ModuleInstance): Promise<void> {
		const eventStartTime = process.hrtime.bigint();
		this.emitter.emit('event', event);

		await this.emitLog('source.emit', {
			event_id: event.id,
			trace_id: event.trace_id,
			source: event.source,
			event_type: event.type,
			module: mod.name,
		});

		if (event.trace_id) {
			const loopCheck = this.loopDetector.check(
				event.trace_id,
				event.id,
				event.source,
				event.type,
				null,
				null,
			);

			if (loopCheck.circuit_broken) {
				await this.emitLog('loop.circuit_broken', {
					event_id: event.id,
					trace_id: event.trace_id,
					source: event.source,
					module: mod.name,
					result: `Circuit broken: event chain depth ${loopCheck.chain_depth} exceeds limit`,
					metadata: {
						chain_depth: loopCheck.chain_depth,
						chain: loopCheck.chain.map((n) => n.event_id),
					},
				});
				this.emitter.emit('loop:circuit_broken', { event, loopCheck });
				await this.bus.ack(event.id);
				return;
			}

			if (loopCheck.loop_detected) {
				await this.emitLog('loop.detected', {
					event_id: event.id,
					trace_id: event.trace_id,
					source: event.source,
					module: mod.name,
					result: `Loop detected: chain depth ${loopCheck.chain_depth}`,
					metadata: {
						chain_depth: loopCheck.chain_depth,
						flags: loopCheck.flags.map((f) => f.message),
					},
				});
				this.emitter.emit('loop:detected', { event, loopCheck });
			}
		}

		await this.bus.publish(event);

		const matched = matchRoutes(event, mod.getRoutes());

		if (matched.length === 0) {
			await this.emitLog('route.no_match', {
				event_id: event.id,
				trace_id: event.trace_id,
				source: event.source,
				module: mod.name,
			});

			this.eventHistory.push(this.buildEventRecord(event, mod.name, [], [], [], eventStartTime));
			await this.bus.ack(event.id);
			return;
		}

		const matchedRouteRefs: RouteRef[] = [];
		const sopFiles: string[] = [];
		const actorIds: string[] = [];
		const now = new Date().toISOString();
		const routeStats = mod.getRouteStats();

		for (const match of matched) {
			const { route } = match;
			const routeStartTime = process.hrtime.bigint();
			const routeRef: RouteRef = { module: mod.name, name: route.name };

			matchedRouteRefs.push(routeRef);
			actorIds.push(route.then.actor);
			if (route.with?.prompt_file) {
				sopFiles.push(route.with.prompt_file);
			}

			routeStats.recordFire(route.name, now);

			await this.emitLog('route.match', {
				event_id: event.id,
				trace_id: event.trace_id,
				route: routeRef,
				source: event.source,
				target: route.then.actor,
				module: mod.name,
			});

			let transformedEvent = event;
			if (route.transforms && route.transforms.length > 0) {
				const pipelineOptions: TransformPipelineOptions = {
					definitions: mod.config.transforms,
					packageTransforms: mod.getTransformsMap(),
					onLog: (partial) => {
						void this.emitLog(partial.phase ?? 'transform.start', {
							...partial,
							event_id: partial.event_id ?? event.id,
							trace_id: partial.trace_id ?? event.trace_id,
							route: routeRef,
							module: mod.name,
						});
					},
				};

				const context = {
					source: event.source,
					target: route.then.actor,
					eventType: event.type,
					routeName: route.name,
				};

				try {
					const result = await executeTransformPipeline(
						event,
						context,
						route.transforms,
						pipelineOptions,
					);

					if (result.dropped || !result.event) {
						this.recordRouteMetrics(
							route.name,
							mod.name,
							route.then.actor,
							'skipped',
							routeStartTime,
						);
						continue;
					}
					transformedEvent = result.event;
				} catch (err) {
					this.emitter.emit('error', err as Error);
					this.recordRouteMetrics(route.name, mod.name, route.then.actor, 'error', routeStartTime);
					continue;
				}
			}

			const dispatchResult: DispatchResult = await this.routeDispatcher.dispatch(
				transformedEvent,
				route,
				mod,
			);
			this.recordRouteMetrics(
				route.name,
				mod.name,
				route.then.actor,
				dispatchResult.status,
				routeStartTime,
			);
		}

		this.eventHistory.push(
			this.buildEventRecord(event, mod.name, matchedRouteRefs, sopFiles, actorIds, eventStartTime),
		);

		await this.bus.ack(event.id);
	}

	private recordRouteMetrics(
		routeName: string,
		moduleName: string,
		actor: string,
		status: DispatchResult['status'],
		startTime: bigint,
	): void {
		if (!this.metricsServer) return;
		const elapsed = Number(process.hrtime.bigint() - startTime) / 1e9;
		this.metricsServer.eventsRouted.inc({
			route: routeName,
			module: moduleName,
			connector: actor,
			status,
		});
		this.metricsServer.eventProcessingSeconds.observe(
			{ route: routeName, module: moduleName, status },
			elapsed,
		);
	}

	private buildEventRecord(
		event: OrgLoopEvent,
		moduleName: string,
		matchedRouteRefs: RouteRef[],
		sopFiles: string[],
		actorIds: string[],
		startTime: bigint,
	): EventRecord {
		const elapsedMs = Number(process.hrtime.bigint() - startTime) / 1e6;
		return {
			event_id: event.id,
			timestamp: event.timestamp,
			source: event.source,
			type: event.type,
			matched_routes: matchedRouteRefs,
			sop_files: sopFiles,
			actors: actorIds,
			processing_ms: Math.round(elapsedMs * 100) / 100,
			module: moduleName,
			trace_id: event.trace_id,
		};
	}

	private async emitLog(
		phase: LogPhase,
		fields: Partial<LogEntry> & { module?: string },
	): Promise<void> {
		await this.logSink.log(buildLogEntry(phase, fields));
	}
}
