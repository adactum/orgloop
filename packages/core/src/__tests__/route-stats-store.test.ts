import { RouteStatsStore } from '../route-stats-store.js';

describe('RouteStatsStore', () => {
	it('records the first fire', () => {
		const store = new RouteStatsStore();
		store.recordFire('route-a', '2026-04-26T00:00:00Z');
		expect(store.get('route-a')).toEqual({
			fireCount: 1,
			lastFiredAt: '2026-04-26T00:00:00Z',
		});
	});

	it('increments on repeat fires and updates the timestamp', () => {
		const store = new RouteStatsStore();
		store.recordFire('route-a', '2026-04-26T00:00:00Z');
		store.recordFire('route-a', '2026-04-26T00:00:01Z');
		expect(store.get('route-a')).toEqual({
			fireCount: 2,
			lastFiredAt: '2026-04-26T00:00:01Z',
		});
	});

	it('isolates routes from each other', () => {
		const store = new RouteStatsStore();
		store.recordFire('route-a', '2026-04-26T00:00:00Z');
		store.recordFire('route-b', '2026-04-26T00:00:01Z');
		expect(store.get('route-a')?.fireCount).toBe(1);
		expect(store.get('route-b')?.fireCount).toBe(1);
	});

	it('returns a snapshot from get() — mutating the result does not corrupt state', () => {
		const store = new RouteStatsStore();
		store.recordFire('route-a', '2026-04-26T00:00:00Z');
		const snap = store.get('route-a');
		if (!snap) throw new Error('expected snap');
		snap.fireCount = 999;
		snap.lastFiredAt = 'bogus';
		// Subsequent get() must reflect the actual recorded state, not the mutation.
		expect(store.get('route-a')).toEqual({
			fireCount: 1,
			lastFiredAt: '2026-04-26T00:00:00Z',
		});
	});

	it('returns snapshots from entries() — mutation does not corrupt state', () => {
		const store = new RouteStatsStore();
		store.recordFire('route-a', '2026-04-26T00:00:00Z');
		store.recordFire('route-b', '2026-04-26T00:00:01Z');
		for (const [, stats] of store.entries()) {
			stats.fireCount = -1;
		}
		expect(store.get('route-a')?.fireCount).toBe(1);
		expect(store.get('route-b')?.fireCount).toBe(1);
	});
});
