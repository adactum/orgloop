import { buildCliBundle } from '../cli-bundle.js';

// Minimal Runtime stub — buildCliBundle only stores the reference; doctor and
// load-project handlers don't call into the runtime when not invoked.
function fakeRuntime(): import('@orgloop/core').Runtime {
	return {
		listModules: () => [],
		loadModule: async () => ({}) as never,
		unloadModule: async () => {},
	} as unknown as import('@orgloop/core').Runtime;
}

describe('buildCliBundle', () => {
	it('exposes /api/doctor and /control/module/load-project handlers', () => {
		const bundle = buildCliBundle({
			runtime: fakeRuntime(),
			doctorConfigPath: '/tmp/orgloop.yaml',
		});
		expect(bundle.name).toBe('cli-handlers');
		expect(bundle.apiHandlers?.has('doctor')).toBe(true);
		expect(bundle.controlHandlers?.has('module/load-project')).toBe(true);
	});

	it('module/load-project rejects requests missing required fields', async () => {
		const bundle = buildCliBundle({
			runtime: fakeRuntime(),
			doctorConfigPath: '/tmp/orgloop.yaml',
		});
		const handler = bundle.controlHandlers?.get('module/load-project');
		if (!handler) throw new Error('expected module/load-project handler');
		await expect(handler({}, {})).rejects.toThrow(/configPath and projectDir/);
		await expect(handler({ configPath: '/x' }, {})).rejects.toThrow(/configPath and projectDir/);
		await expect(handler({ projectDir: '/x' }, {})).rejects.toThrow(/configPath and projectDir/);
	});
});
