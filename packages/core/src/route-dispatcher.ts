/**
 * RouteDispatcher — owns per-route delivery for a single matched route.
 *
 * Extracted from Runtime to centralize:
 *   - Inbox interception (held)
 *   - Prompt-file resolution
 *   - Output-validation pre-pass
 *   - Actor delivery
 *   - Audit-record construction
 *
 * Returns a DispatchResult so the caller can label metrics with status.
 */

import { readFile } from 'node:fs/promises';
import type {
	LogEntry,
	LogPhase,
	OrgLoopEvent,
	RouteDefinition,
	RouteDeliveryConfig,
	RouteRef,
} from '@orgloop/sdk';
import type { AuditFlag, AuditOutput, AuditRecord } from './audit.js';
import { type AuditTrail, contentHash, generateAuditId } from './audit.js';
import { DeliveryError } from './errors.js';
import type { InboxConfig, InboxManager } from './inbox.js';
import type { LoggerManager } from './logger.js';
import { buildLogEntry } from './logger.js';
import type { LoopDetector } from './loop-detector.js';
import type { MetricsServer } from './metrics.js';
import type { ModuleInstance } from './module-instance.js';
import type { OutputValidator } from './output-validator.js';
import { stripFrontMatter } from './prompt.js';
import { interpolateConfig } from './router.js';

// ─── Types ───────────────────────────────────────────────────────────────────

export type DispatchStatus = 'delivered' | 'rejected' | 'error' | 'held' | 'skipped';

export interface DispatchResult {
	auditId: string | null;
	status: DispatchStatus;
	durationMs: number;
	flags: AuditFlag[];
}

export interface RouteDispatcherDeps {
	loggerManager: LoggerManager;
	metricsServer: MetricsServer | null;
	inboxManager: InboxManager | null;
	loopDetector: LoopDetector;
	outputValidator: OutputValidator;
	auditTrail: AuditTrail;
	emit: (event: string, data: unknown) => void;
}

// ─── RouteDispatcher ─────────────────────────────────────────────────────────

export class RouteDispatcher {
	private readonly loggerManager: LoggerManager;
	private readonly metricsServer: MetricsServer | null;
	private readonly inboxManager: InboxManager | null;
	private readonly loopDetector: LoopDetector;
	private readonly outputValidator: OutputValidator;
	private readonly auditTrail: AuditTrail;
	private readonly emit: (event: string, data: unknown) => void;

	constructor(deps: RouteDispatcherDeps) {
		this.loggerManager = deps.loggerManager;
		this.metricsServer = deps.metricsServer;
		this.inboxManager = deps.inboxManager;
		this.loopDetector = deps.loopDetector;
		this.outputValidator = deps.outputValidator;
		this.auditTrail = deps.auditTrail;
		this.emit = deps.emit;
	}

	async dispatch(
		event: OrgLoopEvent,
		route: RouteDefinition,
		mod: ModuleInstance,
	): Promise<DispatchResult> {
		const routeName = route.name;
		const routeRef: RouteRef = { module: mod.name, name: routeName };
		const actorId = route.then.actor;
		const startTime = Date.now();
		const auditFlags: AuditFlag[] = [];
		const auditOutputs: AuditOutput[] = [];

		const actor = mod.getActor(actorId);
		if (!actor) {
			const error = new DeliveryError(actorId, routeRef, `Actor "${actorId}" not found`);
			this.emit('error', error);
			const durationMs = Date.now() - startTime;
			const record = this.buildAuditRecord(
				event,
				routeRef,
				route,
				actorId,
				'error',
				auditOutputs,
				auditFlags,
				durationMs,
			);
			this.auditTrail.record(record);
			await this.emitAuditLog(event, routeRef, actorId, record, 'error');
			return { auditId: record.id, status: 'error', durationMs, flags: auditFlags };
		}

		await this.emitLog('deliver.attempt', {
			event_id: event.id,
			trace_id: event.trace_id,
			route: routeRef,
			target: actorId,
			module: mod.name,
		});

		let deliveryStatus: DispatchStatus = 'error';

		try {
			// Build delivery config (interpolate {{dot.path}} templates from event)
			const deliveryConfig: RouteDeliveryConfig = {
				...interpolateConfig(route.then.config ?? {}, event),
			};

			// ─── Inbox Interception ─────────────────────────────────────────
			if (this.inboxManager && deliveryConfig.inbox === true && deliveryConfig.session_key) {
				const sessionKey = String(deliveryConfig.session_key);
				const inboxConfig: InboxConfig = {
					inbox: true,
					session_key: sessionKey,
					inbox_ttl: deliveryConfig.inbox_ttl as string | undefined,
					inbox_max_batch: deliveryConfig.inbox_max_batch as number | undefined,
				};

				try {
					await this.inboxManager.enqueue(sessionKey, event, inboxConfig);
					await this.emitLog('deliver.success', {
						event_id: event.id,
						trace_id: event.trace_id,
						route: routeRef,
						target: actorId,
						module: mod.name,
						result: `Enqueued to inbox for session: ${sessionKey}`,
					});
					this.emit('delivery', {
						event,
						route: routeRef,
						actor: actorId,
						status: 'held',
						inbox: true,
					});

					const durationMs = Date.now() - startTime;
					const record = this.buildAuditRecord(
						event,
						routeRef,
						route,
						actorId,
						'held',
						[],
						[],
						durationMs,
					);
					this.auditTrail.record(record);
					await this.emitAuditLog(event, routeRef, actorId, record, 'held');
					return { auditId: record.id, status: 'held', durationMs, flags: [] };
				} catch (err) {
					// Graceful degradation: inbox failure → fall through to direct delivery
					await this.emitLog('deliver.failure', {
						event_id: event.id,
						trace_id: event.trace_id,
						route: routeRef,
						target: actorId,
						module: mod.name,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}

			// Resolve launch prompt if configured
			if (route.with?.prompt_file) {
				try {
					const promptContent = await readFile(route.with.prompt_file, 'utf-8');
					const { content: strippedContent, metadata } = stripFrontMatter(promptContent);
					deliveryConfig.launch_prompt = strippedContent;
					deliveryConfig.launch_prompt_file = route.with.prompt_file;
					deliveryConfig.launch_prompt_meta = metadata;
				} catch {
					// Non-fatal: log but continue delivery
				}
			}

			// ─── Output Validation ───────────────────────────────────────
			const deliveryContent = JSON.stringify(deliveryConfig);
			const validation = this.outputValidator.validate(deliveryContent, event);

			if (validation.flags.length > 0) {
				auditFlags.push(...validation.flags);
				for (const flag of validation.flags) {
					await this.emitLog('audit.flag', {
						event_id: event.id,
						trace_id: event.trace_id,
						route: routeRef,
						target: actorId,
						module: mod.name,
						result: flag.message,
						metadata: { flag_type: flag.type, severity: flag.severity },
					});
				}
			}

			if (validation.hold_for_review) {
				deliveryStatus = 'held';
				await this.emitLog('audit.held', {
					event_id: event.id,
					trace_id: event.trace_id,
					route: routeRef,
					target: actorId,
					module: mod.name,
					result: 'Output held for human review due to critical flags',
					metadata: { flags: validation.flags.map((f) => f.message) },
				});
				this.emit('audit:held', { event, route: routeRef, actor: actorId, validation });
			} else {
				const result = await actor.deliver(event, deliveryConfig);
				const durationMs = Date.now() - startTime;

				auditOutputs.push({
					type: `deliver.${result.status}`,
					target: actorId,
					content_hash: contentHash(deliveryConfig),
					timestamp: new Date().toISOString(),
					flags: validation.flags,
				});

				if (result.status === 'delivered') {
					deliveryStatus = 'delivered';
					await this.emitLog('deliver.success', {
						event_id: event.id,
						trace_id: event.trace_id,
						route: routeRef,
						target: actorId,
						duration_ms: durationMs,
						module: mod.name,
					});
					this.emit('delivery', {
						event,
						route: routeRef,
						actor: actorId,
						status: 'delivered',
					});
				} else {
					deliveryStatus = result.status as 'rejected' | 'error';
					await this.emitLog('deliver.failure', {
						event_id: event.id,
						trace_id: event.trace_id,
						route: routeRef,
						target: actorId,
						duration_ms: durationMs,
						error: result.error?.message ?? result.status,
						module: mod.name,
					});
					this.emit('delivery', {
						event,
						route: routeRef,
						actor: actorId,
						status: result.status,
					});
				}
			}
		} catch (err) {
			const durationMs = Date.now() - startTime;
			deliveryStatus = 'error';
			const error = new DeliveryError(actorId, routeRef, 'Delivery failed', { cause: err });
			this.emit('error', error);
			this.metricsServer?.connectorErrors.inc({ connector: actorId });
			await this.emitLog('deliver.failure', {
				event_id: event.id,
				trace_id: event.trace_id,
				route: routeRef,
				target: actorId,
				duration_ms: durationMs,
				error: error.message,
				module: mod.name,
			});
		}

		const durationMs = Date.now() - startTime;
		const record = this.buildAuditRecord(
			event,
			routeRef,
			route,
			actorId,
			deliveryStatus,
			auditOutputs,
			auditFlags,
			durationMs,
		);
		this.auditTrail.record(record);
		await this.emitAuditLog(event, routeRef, actorId, record, deliveryStatus);

		return { auditId: record.id, status: deliveryStatus, durationMs, flags: auditFlags };
	}

	// ─── Helpers ─────────────────────────────────────────────────────────────

	private buildAuditRecord(
		event: OrgLoopEvent,
		routeRef: RouteRef,
		route: RouteDefinition,
		actorId: string,
		status: DispatchStatus,
		outputs: AuditOutput[],
		flags: AuditFlag[],
		durationMs: number,
	): AuditRecord {
		const chainDepth = event.trace_id ? this.loopDetector.getChainDepth(event.trace_id) : 1;
		// AuditRecord.delivery_status doesn't include 'skipped' (skipped never reaches dispatch);
		// coerce to a valid value.
		const recordStatus: AuditRecord['delivery_status'] = status === 'skipped' ? 'rejected' : status;
		return {
			id: generateAuditId(),
			timestamp: new Date().toISOString(),
			trace_id: event.trace_id ?? '',
			input_event_id: event.id,
			input_source: event.source,
			input_type: event.type,
			input_content_hash: contentHash(event.payload),
			route: routeRef,
			sop_file: route.with?.prompt_file ?? null,
			module: routeRef.module,
			actor: actorId,
			delivery_status: recordStatus,
			duration_ms: durationMs,
			outputs,
			chain_depth: chainDepth,
			parent_event_id: null,
			held_for_review: status === 'held',
			flags,
		};
	}

	private async emitAuditLog(
		event: OrgLoopEvent,
		routeRef: RouteRef,
		actorId: string,
		record: AuditRecord,
		status: DispatchStatus,
	): Promise<void> {
		await this.emitLog('audit.record', {
			event_id: event.id,
			trace_id: event.trace_id,
			route: routeRef,
			target: actorId,
			module: routeRef.module,
			metadata: {
				audit_id: record.id,
				delivery_status: status,
				chain_depth: record.chain_depth,
				flag_count: record.flags.length,
				held: record.held_for_review,
			},
		});
	}

	private async emitLog(
		phase: LogPhase,
		fields: Partial<LogEntry> & { module?: string },
	): Promise<void> {
		await this.loggerManager.log(buildLogEntry(phase, fields));
	}
}
