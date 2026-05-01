/**
 * RouteStatsStore — module-scoped fire counts and last-fired timestamps.
 *
 * Owned by ModuleInstance; the Runtime/EventProcessor only call `recordFire`.
 * No public set/delete surface — stats are immutable from outside the module.
 */

export interface RouteStats {
	fireCount: number;
	lastFiredAt: string | null;
}

export class RouteStatsStore {
	private readonly stats = new Map<string, RouteStats>();

	/** Record a single route fire. */
	recordFire(routeName: string, timestamp: string): void {
		const existing = this.stats.get(routeName);
		if (existing) {
			existing.fireCount++;
			existing.lastFiredAt = timestamp;
			return;
		}
		this.stats.set(routeName, { fireCount: 1, lastFiredAt: timestamp });
	}

	/**
	 * Look up stats for a single route name.
	 *
	 * Returns a snapshot — mutating the result does NOT affect internal state.
	 */
	get(routeName: string): RouteStats | undefined {
		const s = this.stats.get(routeName);
		return s ? { fireCount: s.fireCount, lastFiredAt: s.lastFiredAt } : undefined;
	}

	/**
	 * Iterate over all (name, stats) entries.
	 *
	 * Each entry's stats is a snapshot — mutating it does NOT affect internal
	 * state. Returns a materialised array rather than a live iterator so the
	 * snapshot semantics are explicit at the type level.
	 */
	entries(): Array<[string, RouteStats]> {
		return Array.from(this.stats, ([name, s]) => [
			name,
			{ fireCount: s.fireCount, lastFiredAt: s.lastFiredAt },
		]);
	}
}
