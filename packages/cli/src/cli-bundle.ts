/**
 * CLI handler bundle — registers `/api/doctor` and `/control/module/load-project`
 * as a HandlerBundle so first-party CLI handlers go through the same
 * registration path as core REST/inbox/control handlers.
 */

import { resolve } from 'node:path';
import type {
	BundleApiHandler as ApiHandler,
	ControlHandler,
	HandlerBundle,
	ModuleConfig,
	Runtime,
} from '@orgloop/core';
import { registerModule } from './module-registry.js';
import {
	deriveModuleName,
	loadCliConfig,
	loadDotEnv,
	resolveModuleResources,
} from './project-loader.js';

export interface CliBundleDeps {
	runtime: Runtime;
	doctorConfigPath: string;
}

export function buildCliBundle(deps: CliBundleDeps): HandlerBundle {
	const doctor: ApiHandler = async () => {
		const { runDoctor } = await import('./commands/doctor.js');
		return { body: await runDoctor(deps.doctorConfigPath) };
	};

	const loadProject: ControlHandler = async (body) => {
		const reqConfigPath = body.configPath as string;
		const reqProjectDir = body.projectDir as string;

		if (!reqConfigPath || !reqProjectDir) {
			throw new Error('configPath and projectDir are required');
		}

		// Load .env from the module's project directory so ${ENV_VAR} references resolve
		await loadDotEnv(reqConfigPath);

		const reqConfig = await loadCliConfig({ configPath: reqConfigPath });
		const moduleName = deriveModuleName(reqConfig.project.name, reqProjectDir);

		// Check if module already loaded — if so, reload it
		const existingModules = deps.runtime.listModules();
		const existing = existingModules.find((m) => (m as { name: string }).name === moduleName);

		if (existing) {
			// Hot-reload: unload then reload
			await deps.runtime.unloadModule(moduleName);
		}

		const reqResolved = await resolveModuleResources(reqConfig, reqProjectDir);

		const moduleConfig: ModuleConfig = {
			name: moduleName,
			sources: reqConfig.sources,
			actors: reqConfig.actors,
			routes: reqConfig.routes,
			transforms: reqConfig.transforms,
			loggers: reqConfig.loggers,
			defaults: reqConfig.defaults,
			modulePath: resolve(reqProjectDir),
		};

		const status = await deps.runtime.loadModule(moduleConfig, {
			sources: reqResolved.resolvedSources,
			actors: reqResolved.resolvedActors,
			transforms: reqResolved.resolvedTransforms,
			loggers: reqResolved.resolvedLoggers,
		});

		// Track in modules.json
		await registerModule({
			name: moduleName,
			sourceDir: resolve(reqProjectDir),
			configPath: reqConfigPath,
			loadedAt: new Date().toISOString(),
		});

		return status;
	};

	return {
		name: 'cli-handlers',
		apiHandlers: new Map<string, ApiHandler>([['doctor', doctor]]),
		controlHandlers: new Map<string, ControlHandler>([['module/load-project', loadProject]]),
	};
}
