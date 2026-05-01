/**
 * Project loader — shared helpers for resolving an OrgLoop project's
 * connectors, transforms, and loggers from its config.
 *
 * Re-exports CLI-level helpers (config loading, dotenv, module-registry)
 * so callers can depend on a single import source for project loading.
 */

import type { Logger, OrgLoopConfig, Transform, TransformRegistration } from '@orgloop/sdk';
import { loadCliConfig, resolveConfigPath } from './config.js';
import { loadDotEnv } from './dotenv.js';
import { deriveModuleName } from './module-registry.js';
import * as output from './output.js';
import { createProjectImport } from './project-import.js';
import { resolveConnectors } from './resolve-connectors.js';

export { deriveModuleName, loadCliConfig, loadDotEnv, resolveConfigPath };

export interface ResolvedModuleResources {
	resolvedSources: Awaited<ReturnType<typeof resolveConnectors>>['sources'];
	resolvedActors: Awaited<ReturnType<typeof resolveConnectors>>['actors'];
	resolvedTransforms: Map<string, Transform>;
	resolvedLoggers: Map<string, Logger>;
}

export async function resolveModuleResources(
	config: OrgLoopConfig,
	projectDir: string,
): Promise<ResolvedModuleResources> {
	const projectImport = createProjectImport(projectDir);

	const { sources: resolvedSources, actors: resolvedActors } = await resolveConnectors(
		config,
		projectImport as Parameters<typeof resolveConnectors>[1],
	);

	const resolvedTransforms = new Map<string, Transform>();
	for (const tDef of config.transforms) {
		if (tDef.type === 'package' && tDef.package) {
			try {
				const mod = await projectImport(tDef.package);
				if (typeof mod.register === 'function') {
					const reg = mod.register() as TransformRegistration;

					// Validate transform config against schema if available — delegated
					// to the canonical Ajv authority in @orgloop/core/schema.ts so we
					// don't instantiate Ajv from inside the CLI.
					if (reg.configSchema && tDef.config) {
						try {
							const { compileWithCanonicalAjv } = await import('@orgloop/core');
							const validate = compileWithCanonicalAjv(reg.configSchema);
							if (!validate(tDef.config)) {
								const errors = (validate.errors ?? [])
									.map(
										(e: { instancePath?: string; message?: string }) =>
											`${e.instancePath || '/'}: ${e.message}`,
									)
									.join('; ');
								output.warn(
									`Transform "${tDef.name}" config validation failed: ${errors}. Check your transform YAML config matches the expected schema.`,
								);
							}
						} catch {
							// Schema validation is best-effort
						}
					}

					resolvedTransforms.set(tDef.name, new reg.transform());
				}
			} catch (err) {
				output.warn(
					`Transform "${tDef.name}" (${tDef.package}) not available: ${err instanceof Error ? err.message : String(err)}`,
				);
			}
		}
	}

	const resolvedLoggers = new Map<string, Logger>();
	for (const loggerDef of config.loggers) {
		try {
			const mod = await projectImport(loggerDef.type);
			if (typeof mod.register === 'function') {
				const reg = mod.register();
				resolvedLoggers.set(loggerDef.name, new reg.logger());
			}
		} catch (err) {
			output.warn(
				`Logger "${loggerDef.name}" (${loggerDef.type}) not available: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	return {
		resolvedSources,
		resolvedActors,
		resolvedTransforms,
		resolvedLoggers,
	};
}
