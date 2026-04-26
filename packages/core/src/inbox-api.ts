/**
 * Inbox REST API — registers /api/inbox/* endpoints on the WebhookServer.
 *
 *   GET /api/inbox/drain?session_key=<key>&limit=100  — drain pending events
 *   GET /api/inbox/status?session_key=<key>           — check pending count
 */

import type { ApiHandler, HandlerBundle } from './handler-bundle.js';
import type { Runtime } from './runtime.js';

export function buildInboxApiBundle(runtime: Runtime): HandlerBundle | null {
	const manager = runtime.getInboxManager();
	if (!manager) return null;

	const drain: ApiHandler = async (query) => {
		const sessionKey = query.get('session_key');
		if (!sessionKey) {
			return { body: { error: 'Missing required parameter: session_key' } };
		}
		const limitStr = query.get('limit');
		const limit = limitStr ? Number.parseInt(limitStr, 10) : undefined;
		return { body: await manager.drain(sessionKey, limit) };
	};

	const status: ApiHandler = async (query) => {
		const sessionKey = query.get('session_key');
		if (!sessionKey) {
			return { body: { error: 'Missing required parameter: session_key' } };
		}
		return { body: { pending: await manager.pending(sessionKey) } };
	};

	return {
		name: 'inbox-api',
		apiHandlers: new Map<string, ApiHandler>([
			['inbox/drain', drain],
			['inbox/status', status],
		]),
	};
}

/**
 * @deprecated Use `buildInboxApiBundle` + `WebhookServer.registerBundle()`
 * directly. Retained as a thin shim so external callers don't break — the
 * body now goes through the same bundle path as new code.
 */
export function registerInboxApi(runtime: Runtime): void {
	const bundle = buildInboxApiBundle(runtime);
	if (!bundle) return;
	runtime.getWebhookServer().registerBundle(bundle);
}
