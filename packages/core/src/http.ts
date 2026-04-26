/**
 * WebhookServer — lightweight HTTP server for webhook-based sources.
 *
 * Listens on localhost only. Routes POST /webhook/:sourceId to registered handlers.
 * Control API endpoints are available when a RuntimeControl is set.
 * No auth, no CORS — just local event ingestion.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { OrgLoopEvent, WebhookHandler } from '@orgloop/sdk';
import type { ApiResponse, HandlerBundle } from './handler-bundle.js';

export const DEFAULT_HTTP_PORT = 4800;

/** Interface for runtime control — avoids circular dependency with Runtime class. */
export interface RuntimeControl {
	status(): unknown;
	loadModule(config: unknown): Promise<unknown>;
	unloadModule(name: string): Promise<void>;
	reloadModule(name: string): Promise<void>;
	listModules(): unknown[];
	getModuleStatus(name: string): unknown;
	stop(): Promise<void>;
}

/**
 * API handler signature accepted by `WebhookServer.registerApiHandler`.
 *
 * Either return an `ApiResponse` envelope with explicit headers, or return
 * the raw body and let the dispatcher serialise it as JSON. The dispatcher
 * detects the envelope shape and unwraps accordingly (migration bridge).
 */
export type ApiHandler = (query: URLSearchParams) => Promise<unknown | ApiResponse>;

/** Control handler: body + parsed path params. */
export type ControlHandlerFn = (
	body: Record<string, unknown>,
	params?: Record<string, string>,
) => Promise<unknown>;

interface ParameterisedRoute {
	pattern: string[];
	handler: ControlHandlerFn;
	method: 'GET' | 'POST';
}

function isApiResponse(value: unknown): value is ApiResponse {
	return (
		typeof value === 'object' &&
		value !== null &&
		'body' in value &&
		// allow optional headers — but be strict about shape so plain objects with `body` keys aren't misidentified
		Object.keys(value as Record<string, unknown>).every((k) => k === 'body' || k === 'headers')
	);
}

function compileRoutePattern(route: string): string[] {
	return route.split('/').filter((p) => p.length > 0);
}

function matchRoutePattern(pattern: string[], parts: string[]): Record<string, string> | null {
	if (pattern.length !== parts.length) return null;
	const params: Record<string, string> = {};
	for (let i = 0; i < pattern.length; i++) {
		const seg = pattern[i];
		if (seg.startsWith(':')) {
			params[seg.slice(1)] = parts[i];
		} else if (seg !== parts[i]) {
			return null;
		}
	}
	return params;
}

export class WebhookServer {
	private readonly handlers: Map<string, WebhookHandler>;
	private readonly onEvent: (event: OrgLoopEvent) => Promise<void>;
	private server: ReturnType<typeof createServer> | null = null;
	private _runtime: RuntimeControl | null = null;
	private readonly controlHandlers = new Map<string, ControlHandlerFn>();
	private readonly controlHandlerMethods = new Map<string, 'GET' | 'POST'>();
	private readonly parameterisedControlRoutes: ParameterisedRoute[] = [];
	private readonly apiHandlers = new Map<string, ApiHandler>();

	constructor(
		onEvent: (event: OrgLoopEvent) => Promise<void>,
		handlers?: Map<string, WebhookHandler>,
	) {
		this.onEvent = onEvent;
		this.handlers = handlers ?? new Map();
	}

	/** Register a custom control API handler for a given route suffix. */
	registerControlHandler(
		route: string,
		handler: ControlHandlerFn,
		method: 'GET' | 'POST' = 'POST',
	): void {
		if (route.includes(':')) {
			this.parameterisedControlRoutes.push({
				pattern: compileRoutePattern(route),
				handler,
				method,
			});
			return;
		}
		this.controlHandlers.set(route, handler);
		this.controlHandlerMethods.set(route, method);
	}

	/** Register a GET /api/:route handler. */
	registerApiHandler(route: string, handler: ApiHandler): void {
		this.apiHandlers.set(route, handler);
	}

	/**
	 * Install a HandlerBundle: maps control / API / webhook handlers in one
	 * shot.
	 */
	registerBundle(bundle: HandlerBundle): void {
		if (bundle.controlHandlers) {
			for (const [route, handler] of bundle.controlHandlers) {
				const adapted: ControlHandlerFn = (body, params) => handler(body, params ?? {});
				const method = bundle.controlHandlerMethods?.get(route) ?? 'POST';
				this.registerControlHandler(route, adapted, method);
			}
		}
		if (bundle.apiHandlers) {
			for (const [route, handler] of bundle.apiHandlers) {
				this.registerApiHandler(route, handler);
			}
		}
		if (bundle.webhookHandlers) {
			for (const [route, handler] of bundle.webhookHandlers) {
				this.handlers.set(route, async (req, res) => {
					await handler(req, res);
					return [];
				});
			}
		}
	}

	set runtime(rt: RuntimeControl) {
		this._runtime = rt;
	}

	addHandler(sourceId: string, handler: WebhookHandler): void {
		this.handlers.set(sourceId, handler);
	}

	removeHandler(sourceId: string): void {
		this.handlers.delete(sourceId);
	}

	async start(port: number): Promise<void> {
		return new Promise((resolve, reject) => {
			this.server = createServer((req, res) => {
				void this.handleRequest(req, res);
			});

			this.server.on('error', reject);
			this.server.listen(port, '127.0.0.1', () => {
				resolve();
			});
		});
	}

	async stop(): Promise<void> {
		const srv = this.server;
		if (!srv) return;
		return new Promise((resolve) => {
			// Force-close lingering connections after 5s so shutdown doesn't hang
			const timeout = setTimeout(() => {
				srv.closeAllConnections();
			}, 5_000);
			srv.close(() => {
				clearTimeout(timeout);
				this.server = null;
				resolve();
			});
		});
	}

	private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
		const parts = url.pathname.split('/').filter(Boolean);

		// Control API routes
		if (parts[0] === 'control') {
			await this.handleControlRequest(req, res, parts.slice(1));
			return;
		}

		// REST API routes (GET /api/*)
		if (parts[0] === 'api') {
			await this.handleApiRequest(req, res, url, parts.slice(1));
			return;
		}

		// Route: POST /webhook/:sourceId
		if (parts.length !== 2 || parts[0] !== 'webhook') {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
			return;
		}

		const sourceId = parts[1];

		if (req.method !== 'POST') {
			res.writeHead(405, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Method not allowed' }));
			return;
		}

		const handler = this.handlers.get(sourceId);
		if (!handler) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: `Unknown source: ${sourceId}` }));
			return;
		}

		try {
			const events = await handler(req, res);
			for (const event of events) {
				await this.onEvent(event);
			}
		} catch (err) {
			// If the handler hasn't written a response yet, send 500
			if (!res.headersSent) {
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
			}
		}
	}

	private async handleControlRequest(
		req: IncomingMessage,
		res: ServerResponse,
		parts: string[],
	): Promise<void> {
		const route = parts.join('/');

		try {
			// Exact match wins over parameterised routes.
			const exact = this.controlHandlers.get(route);
			if (exact) {
				const requiredMethod = this.controlHandlerMethods.get(route) ?? 'POST';
				if (req.method !== requiredMethod) {
					res.writeHead(405, {
						'Content-Type': 'application/json',
						Allow: requiredMethod,
					});
					res.end(JSON.stringify({ error: 'Method not allowed' }));
					return;
				}
				const body = req.method === 'POST' ? await this.readBody(req) : {};
				const result = await exact(body, {});
				this.jsonResponse(res, 200, result);
				return;
			}

			for (const route of this.parameterisedControlRoutes) {
				const params = matchRoutePattern(route.pattern, parts);
				if (params) {
					const requiredMethod = route.method ?? 'POST';
					if (req.method !== requiredMethod) {
						res.writeHead(405, {
							'Content-Type': 'application/json',
							Allow: requiredMethod,
						});
						res.end(JSON.stringify({ error: 'Method not allowed' }));
						return;
					}
					const body = req.method === 'POST' ? await this.readBody(req) : {};
					const result = await route.handler(body, params);
					this.jsonResponse(res, 200, result);
					return;
				}
			}

			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
		} catch (err) {
			if (res.headersSent) return;
			if (err instanceof Error && err.name === 'ModuleNotFoundError') {
				this.jsonResponse(res, 404, { error: err.message });
				return;
			}
			res.writeHead(500, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
		}
	}

	private async handleApiRequest(
		req: IncomingMessage,
		res: ServerResponse,
		url: URL,
		parts: string[],
	): Promise<void> {
		if (req.method !== 'GET') {
			res.writeHead(405, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Method not allowed' }));
			return;
		}

		const route = parts.join('/');
		const handler = this.apiHandlers.get(route);

		if (!handler) {
			res.writeHead(404, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify({ error: 'Not found' }));
			return;
		}

		try {
			const result = await handler(url.searchParams);

			if (isApiResponse(result)) {
				const headers = result.headers ?? {};
				const contentType = headers['Content-Type'] ?? 'application/json';
				const isText = contentType.startsWith('text/');
				res.writeHead(200, { ...headers, 'Content-Type': contentType });
				if (isText && typeof result.body === 'string') {
					res.end(result.body);
				} else {
					res.end(JSON.stringify(result.body));
				}
				return;
			}

			this.jsonResponse(res, 200, result);
		} catch (err) {
			if (!res.headersSent) {
				res.writeHead(500, { 'Content-Type': 'application/json' });
				res.end(JSON.stringify({ error: err instanceof Error ? err.message : 'Internal error' }));
			}
		}
	}

	private jsonResponse(res: ServerResponse, status: number, data: unknown): void {
		res.writeHead(status, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(data));
	}

	private readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
		return new Promise((resolve, reject) => {
			const chunks: Buffer[] = [];
			req.on('data', (chunk: Buffer) => chunks.push(chunk));
			req.on('end', () => {
				try {
					const text = Buffer.concat(chunks).toString('utf-8');
					resolve(JSON.parse(text) as Record<string, unknown>);
				} catch (err) {
					reject(err);
				}
			});
			req.on('error', reject);
		});
	}
}
