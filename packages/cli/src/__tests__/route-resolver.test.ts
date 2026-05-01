import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveRoute } from '../route-resolver.js';

async function makeLogFile(lines: object[]): Promise<string> {
	const dir = await mkdtemp(join(tmpdir(), 'orgloop-test-'));
	const path = join(dir, 'orgloop.log');
	await writeFile(path, lines.map((l) => JSON.stringify(l)).join('\n'), 'utf-8');
	return path;
}

describe('resolveRoute', () => {
	it('passes through qualified `module/name` input', async () => {
		const result = await resolveRoute('mod-a/route-x', { offline: true });
		expect(result.matches).toEqual([{ module: 'mod-a', name: 'route-x' }]);
		expect(result.ambiguous).toBe(false);
	});

	it('falls back to log scan when no daemon port', async () => {
		const logFile = await makeLogFile([
			{ route: { module: 'mod-a', name: 'pr-review' } },
			{ route: { module: 'mod-b', name: 'pr-review' } },
			{ route: { module: 'mod-a', name: 'pr-review' } },
		]);
		const result = await resolveRoute('pr-review', { offline: true, logFile });
		expect(result.source).toBe('log');
		expect(result.matches).toHaveLength(2);
		expect(result.ambiguous).toBe(true);
	});

	it('returns no-data fallback when log file missing', async () => {
		const result = await resolveRoute('nope', {
			offline: true,
			logFile: '/tmp/__orgloop-does-not-exist__.log',
		});
		expect(result.matches).toEqual([]);
		expect(result.source).toBe('none');
	});

	it('dedupes via routeRefKey — names with slashes do not collide', async () => {
		// `{module: 'a', name: 'b/c'}` vs `{module: 'a/b', name: 'c'}` both
		// flatten to `a/b/c` under naive slash-keys but are distinct refs.
		const logFile = await makeLogFile([
			{ route: { module: 'a', name: 'shared-name' } },
			{ route: { module: 'a/inner', name: 'shared-name' } },
		]);
		const result = await resolveRoute('shared-name', { offline: true, logFile });
		expect(result.matches).toHaveLength(2);
		const modules = result.matches.map((r) => r.module).sort();
		expect(modules).toEqual(['a', 'a/inner']);
	});
});
