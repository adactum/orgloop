import { describe, expect, it } from 'vitest';
import { ModuleNotFoundError } from '../errors.js';
import { buildRuntimeControlBundle } from '../runtime-control-bundle.js';

function fakeApp(
	overrides?: Partial<import('../http.js').RuntimeControl>,
): import('../http.js').RuntimeControl {
	return {
		status: () =>
			({
				running: true,
				pid: 0,
				uptime_ms: 0,
				modules: [],
			}) as never,
		loadModule: async () => ({}) as never,
		unloadModule: async () => {
			throw new ModuleNotFoundError('missing');
		},
		reloadModule: async () => {
			throw new ModuleNotFoundError('missing');
		},
		listModules: () => [],
		getModuleStatus: () => null,
		stop: async () => {},
		...overrides,
	};
}

describe('buildRuntimeControlBundle', () => {
	it('exposes the expected control handler keys', () => {
		const bundle = buildRuntimeControlBundle({
			app: fakeApp(),
			shutdown: async () => {},
		});
		const keys = Array.from(bundle.controlHandlers?.keys() ?? []);
		expect(keys).toEqual(
			expect.arrayContaining([
				'status',
				'module/load',
				'module/unload',
				'module/reload',
				'module/list',
				'module/status/:name',
				'shutdown',
			]),
		);
	});

	it('module/status/:name throws ModuleNotFoundError when module is missing', async () => {
		const bundle = buildRuntimeControlBundle({
			app: fakeApp(),
			shutdown: async () => {},
		});
		const handler = bundle.controlHandlers?.get('module/status/:name');
		if (!handler) throw new Error('expected control handler');
		await expect(handler({}, { name: 'absent' })).rejects.toThrow(ModuleNotFoundError);
	});

	it('module/unload propagates ModuleNotFoundError thrown by runtime', async () => {
		const bundle = buildRuntimeControlBundle({
			app: fakeApp(),
			shutdown: async () => {},
		});
		const handler = bundle.controlHandlers?.get('module/unload');
		if (!handler) throw new Error('expected control handler');
		await expect(handler({ name: 'absent' }, {})).rejects.toThrow(ModuleNotFoundError);
	});

	it('module/reload propagates ModuleNotFoundError thrown by runtime', async () => {
		const bundle = buildRuntimeControlBundle({
			app: fakeApp(),
			shutdown: async () => {},
		});
		const handler = bundle.controlHandlers?.get('module/reload');
		if (!handler) throw new Error('expected control handler');
		await expect(handler({ name: 'absent' }, {})).rejects.toThrow(ModuleNotFoundError);
	});

	it('module/load returns the load result on success', async () => {
		const loadResult = { name: 'm', state: 'active', sources: 0, routes: 0, actors: 0 };
		const bundle = buildRuntimeControlBundle({
			app: fakeApp({
				loadModule: async () => loadResult as never,
			}),
			shutdown: async () => {},
		});
		const handler = bundle.controlHandlers?.get('module/load');
		if (!handler) throw new Error('expected control handler');
		expect(await handler({ name: 'm' }, {})).toEqual(loadResult);
	});

	it('shutdown defers the actual stop until after the response flushes', async () => {
		let stopped = false;
		const bundle = buildRuntimeControlBundle({
			app: fakeApp(),
			shutdown: async () => {
				stopped = true;
			},
		});
		const handler = bundle.controlHandlers?.get('shutdown');
		if (!handler) throw new Error('expected control handler');
		const result = await handler({}, {});
		expect(result).toEqual({ ok: true });
		// The handler returned `ok` synchronously without waiting on shutdown.
		expect(stopped).toBe(false);
		await new Promise((r) => setImmediate(r));
		expect(stopped).toBe(true);
	});
});
