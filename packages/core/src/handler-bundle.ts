/**
 * HandlerBundle — the post-P4 contract for registering control / API /
 * webhook handlers with the runtime's WebhookServer.
 *
 * Bundles replace direct mutation of the WebhookServer by first-party code
 * (REST API, inbox API, CLI doctor/load-project, etc.). Each bundle is a
 * self-contained map of handlers identified by route key under their prefix.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

/** Handler invoked for `POST /control/<route>` (and `GET` for read-only routes). */
export type ControlHandler = (
	body: Record<string, unknown>,
	params: Record<string, string>,
) => Promise<unknown>;

/** Envelope returned by every API handler. */
export interface ApiResponse {
	body: unknown;
	headers?: Record<string, string>;
}

/** Handler invoked for `GET /api/<route>`. */
export type ApiHandler = (query: URLSearchParams) => Promise<ApiResponse>;

/** Handler invoked for `POST /webhook/<route>`. */
export type WebhookBundleHandler = (
	req: IncomingMessage,
	res: ServerResponse,
) => Promise<void> | void;

export interface HandlerBundle {
	/** Bundle name (used in diagnostics). */
	name: string;
	/**
	 * Control-prefixed handlers. Keys may be exact (e.g. `module/load`) or
	 * parameterised (e.g. `module/status/:name`). Exact keys win over
	 * parameterised ones.
	 */
	controlHandlers?: Map<string, ControlHandler>;
	/**
	 * Required HTTP method per control handler key. Keys must match entries in
	 * `controlHandlers`. Omitted keys default to `'POST'`.
	 *
	 * Use `'GET'` only for read-only, idempotent handlers (e.g. status, list).
	 * Mutating handlers (shutdown, load, unload, reload) must stay `'POST'`.
	 */
	controlHandlerMethods?: Map<string, 'GET' | 'POST'>;
	/** Exact-key API handlers (always GET). */
	apiHandlers?: Map<string, ApiHandler>;
	/** Exact-key webhook handlers (always POST). */
	webhookHandlers?: Map<string, WebhookBundleHandler>;
}
