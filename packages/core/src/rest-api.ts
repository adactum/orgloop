/**
 * REST API — registers /api/* endpoints on the WebhookServer.
 *
 * Provides structured JSON endpoints mirroring CLI functionality:
 *   GET /api/status   — runtime health, uptime, source status, event counts
 *   GET /api/routes   — configured routes with fire counts
 *   GET /api/events   — recent event log with filtering
 *   GET /api/sources  — per-source connector detail
 *   GET /api/metrics  — Prometheus-format metrics
 *   GET /api/doctor   — structured doctor output (registered externally)
 */

import type { ApiHandler, HandlerBundle } from './handler-bundle.js';
import type { Runtime } from './runtime.js';

/**
 * Build a HandlerBundle exporting the runtime's REST API handlers.
 *
 * This is the post-P4 entry point — register it with
 * `kernel.registerHandlerBundle(bundle)`.
 */
export function buildRestApiBundle(runtime: Runtime): HandlerBundle {
	const status: ApiHandler = async () => {
		const runtimeStatus = runtime.status();
		const sources = runtime.getSourceDetails();

		const hasUnhealthy = sources.some((s) => s.status === 'unhealthy');
		const hasDegraded = sources.some((s) => s.status === 'degraded');
		let health: 'ok' | 'degraded' | 'error' = 'ok';
		if (hasUnhealthy) health = 'error';
		else if (hasDegraded) health = 'degraded';

		return {
			body: {
				health,
				running: runtimeStatus.running,
				pid: runtimeStatus.pid,
				uptime_ms: runtimeStatus.uptime_ms,
				http_port: runtimeStatus.httpPort,
				modules: runtimeStatus.modules.map((m) => ({
					name: m.name,
					state: m.state,
					sources: m.sources,
					routes: m.routes,
					actors: m.actors,
					uptime_ms: m.uptime_ms,
				})),
				sources: sources.map((s) => ({
					id: s.id,
					connector: s.connector,
					status: s.status,
					event_count: s.event_count,
					last_event: s.last_event,
				})),
			},
		};
	};

	const routes: ApiHandler = async () => ({ body: runtime.getRouteDetails() });

	const events: ApiHandler = async (query) => {
		const from = query.get('from') ?? undefined;
		const to = query.get('to') ?? undefined;
		const source = query.get('source') ?? undefined;
		const moduleParam = query.get('module') ?? undefined;
		const routeParam = query.get('route') ?? undefined;
		const limitStr = query.get('limit');
		const limit = limitStr ? Number.parseInt(limitStr, 10) : undefined;

		if (moduleParam && routeParam) {
			return {
				body: runtime.queryEvents({
					from,
					to,
					source,
					module: moduleParam,
					route: { module: moduleParam, name: routeParam },
					limit,
				}),
			};
		}

		if (routeParam) {
			const all = runtime.queryEvents({
				from,
				to,
				source,
				module: moduleParam,
				routeName: routeParam,
				limit,
			});

			const matchingModules = new Set<string>();
			for (const rec of all) {
				for (const mr of rec.matched_routes) {
					if (mr.name === routeParam) matchingModules.add(mr.module);
				}
			}

			const headers: Record<string, string> | undefined =
				matchingModules.size >= 2 ? { Warning: 'cross-module aggregation' } : undefined;

			return { body: all, headers };
		}

		return {
			body: runtime.queryEvents({ from, to, source, module: moduleParam, limit }),
		};
	};

	const sources: ApiHandler = async () => ({ body: runtime.getSourceDetails() });

	const metrics: ApiHandler = async () => {
		const text = await runtime.getMetricsText();
		if (text === null) {
			return {
				body: {
					error: 'Metrics not enabled. Set ORGLOOP_METRICS_PORT or metricsPort option.',
				},
			};
		}
		return {
			body: text,
			headers: { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' },
		};
	};

	const apiHandlers = new Map<string, ApiHandler>();
	apiHandlers.set('status', status);
	apiHandlers.set('routes', routes);
	apiHandlers.set('events', events);
	apiHandlers.set('sources', sources);
	apiHandlers.set('metrics', metrics);

	return {
		name: 'rest-api',
		apiHandlers,
	};
}

/**
 * @deprecated Use `buildRestApiBundle` + `WebhookServer.registerBundle()`
 * directly. Retained as a thin shim so external callers don't break — the
 * body now goes through the same bundle path as new code.
 */
export function registerRestApi(runtime: Runtime): void {
	runtime.getWebhookServer().registerBundle(buildRestApiBundle(runtime));
}
