/**
 * RuntimeControlBundle — built-in /control/* endpoints expressed as a
 * HandlerBundle so they go through the same registration path as user
 * bundles.
 *
 * Replaces hard-coded dispatch in `http.ts`. Registered by the kernel
 * before any user-defined bundle.
 */

import { ModuleNotFoundError } from './errors.js';
import type { ControlHandler, HandlerBundle } from './handler-bundle.js';
import type { RuntimeControl } from './http.js';

export interface RuntimeControlBundleDeps {
	/** App-level operations (load/unload/reload, status, etc.). */
	app: RuntimeControl;
	/**
	 * Kernel-owned shutdown — called by the `/control/shutdown` handler after
	 * the response has been written.
	 */
	shutdown: () => Promise<void>;
}

export function buildRuntimeControlBundle(deps: RuntimeControlBundleDeps): HandlerBundle {
	const status: ControlHandler = async () => deps.app.status();

	const moduleLoad: ControlHandler = async (body) => deps.app.loadModule(body);

	const moduleUnload: ControlHandler = async (body) => {
		await deps.app.unloadModule(body.name as string);
		return { ok: true };
	};

	const moduleReload: ControlHandler = async (body) => {
		await deps.app.reloadModule(body.name as string);
		return { ok: true };
	};

	const moduleList: ControlHandler = async () => deps.app.listModules();

	const moduleStatus: ControlHandler = async (_body, params) => {
		const name = params.name;
		if (!name) throw new ModuleNotFoundError('', 'Module name parameter is required');
		const result = deps.app.getModuleStatus(name);
		if (result == null) throw new ModuleNotFoundError(name);
		return result;
	};

	const shutdown: ControlHandler = async () => {
		// Defer the actual stop so the response flushes first.
		setImmediate(() => {
			void deps.shutdown();
		});
		return { ok: true };
	};

	const controlHandlers = new Map<string, ControlHandler>([
		['status', status],
		['module/load', moduleLoad],
		['module/unload', moduleUnload],
		['module/reload', moduleReload],
		['module/list', moduleList],
		['module/status/:name', moduleStatus],
		['shutdown', shutdown],
	]);

	const controlHandlerMethods = new Map<string, 'GET' | 'POST'>([
		['status', 'GET'],
		['module/list', 'GET'],
		['module/status/:name', 'GET'],
		// module/load, module/unload, module/reload, shutdown are POST (default)
	]);

	return {
		name: 'runtime-control',
		controlHandlers,
		controlHandlerMethods,
	};
}
