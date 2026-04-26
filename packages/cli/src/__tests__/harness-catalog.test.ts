import { CODING_AGENT_HARNESSES } from '../harness-catalog.js';

describe('CODING_AGENT_HARNESSES', () => {
	it('lists the five expected harnesses', () => {
		const names = CODING_AGENT_HARNESSES.map((h) => h.name).sort();
		expect(names).toEqual(['claude-code', 'codex', 'opencode', 'pi', 'pi-rust']);
	});

	it('every harness declares at least one integration', () => {
		for (const h of CODING_AGENT_HARNESSES) {
			expect(h.integrations.length).toBeGreaterThan(0);
		}
	});

	it('every harness env var has a description', () => {
		for (const h of CODING_AGENT_HARNESSES) {
			for (const v of h.envVars) {
				expect(v.description).toBeTruthy();
			}
		}
	});

	it('hook integrations point at orgloop hook subcommands', () => {
		for (const h of CODING_AGENT_HARNESSES) {
			for (const integ of h.integrations) {
				expect(integ.command).toMatch(/^orgloop hook /);
			}
		}
	});
});
