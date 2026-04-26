import type { OrgLoopConfig, OrgLoopEvent } from '@orgloop/sdk';
import { createTestEvent, MockActor, MockSource } from '@orgloop/sdk';
import { describe, expect, it } from 'vitest';
import { Runtime } from '../runtime.js';

function makeConfig(overrides?: Partial<OrgLoopConfig>): OrgLoopConfig {
	return {
		project: { name: 'event-processor-test' },
		sources: [],
		actors: [],
		routes: [],
		transforms: [],
		loggers: [],
		...overrides,
	};
}

describe('EventProcessor (via Runtime.inject)', () => {
	it('happy path — event reaches its matched actor and a history record is written', async () => {
		const source = new MockSource('src');
		const actor = new MockActor('act');
		const config = makeConfig({
			sources: [{ id: 'src', connector: 'mock', config: {}, poll: { interval: '5m' } }],
			actors: [{ id: 'act', connector: 'mock', config: {} }],
			routes: [
				{
					name: 'r1',
					when: { source: 'src', events: ['resource.changed'] },
					then: { actor: 'act' },
				},
			],
		});
		const runtime = Runtime.singleModule(config, {
			load: {
				sources: new Map([['src', source]]),
				actors: new Map([['act', actor]]),
			},
		});
		await runtime.start();
		try {
			const event: OrgLoopEvent = createTestEvent({ source: 'src', type: 'resource.changed' });
			await runtime.inject(event);
			expect(actor.delivered).toHaveLength(1);
			const records = runtime.queryEvents();
			expect(records).toHaveLength(1);
			expect(records[0].matched_routes).toEqual([expect.objectContaining({ name: 'r1' })]);
		} finally {
			await runtime.stop();
		}
	});

	it('records a history entry with empty matched_routes when no route matches', async () => {
		const config = makeConfig({
			sources: [{ id: 'src', connector: 'mock', config: {}, poll: { interval: '5m' } }],
		});
		const runtime = Runtime.singleModule(config, {
			load: {
				sources: new Map([['src', new MockSource('src')]]),
				actors: new Map(),
			},
		});
		await runtime.start();
		try {
			await runtime.inject(createTestEvent({ source: 'src', type: 'resource.changed' }));
			const records = runtime.queryEvents();
			expect(records).toHaveLength(1);
			expect(records[0].matched_routes).toEqual([]);
		} finally {
			await runtime.stop();
		}
	});

	it('matched_routes carries RouteRef with module + name', async () => {
		const source = new MockSource('src');
		const actor = new MockActor('act');
		const config = makeConfig({
			sources: [{ id: 'src', connector: 'mock', config: {}, poll: { interval: '5m' } }],
			actors: [{ id: 'act', connector: 'mock', config: {} }],
			routes: [
				{
					name: 'pr-review',
					when: { source: 'src', events: ['resource.changed'] },
					then: { actor: 'act' },
				},
			],
		});
		const runtime = Runtime.singleModule(config, {
			load: {
				sources: new Map([['src', source]]),
				actors: new Map([['act', actor]]),
			},
		});
		await runtime.start();
		try {
			await runtime.inject(createTestEvent({ source: 'src', type: 'resource.changed' }));
			const records = runtime.queryEvents();
			const ref = records[0].matched_routes[0];
			expect(ref.name).toBe('pr-review');
			expect(typeof ref.module).toBe('string');
			expect(ref.module.length).toBeGreaterThan(0);
		} finally {
			await runtime.stop();
		}
	});
});
