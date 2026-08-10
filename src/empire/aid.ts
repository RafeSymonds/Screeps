/**
 * Cross-room spawn aid — pure. A crippled room's demands are re-homed to the
 * nearest Stable sibling; the demand's `home` field was designed for exactly
 * this (architecture §5.6). See docs/design/empire.md.
 */
import { SpawnDemand } from "shared/spawning";
import { EmpireConfig } from "empire/config";
import { RoomLifecycle } from "empire/registry";

/** crippled room → donor room. Distance is injected, so this stays pure. */
export function planAidRoutes(
    lifecycles: Record<string, RoomLifecycle>,
    distance: (a: string, b: string) => number,
    config: EmpireConfig
): Record<string, string> {
    const crippled = Object.keys(lifecycles).filter(r => lifecycles[r] === RoomLifecycle.Crippled);
    const donors = Object.keys(lifecycles).filter(r => lifecycles[r] === RoomLifecycle.Stable);
    const routes: Record<string, string> = {};
    for (const room of crippled.sort()) {
        let best: { name: string; d: number } | undefined;
        for (const donor of donors) {
            const d = distance(room, donor);
            if (d > config.aidRange) {
                continue;
            }
            if (!best || d < best.d || (d === best.d && donor < best.name)) {
                best = { name: donor, d };
            }
        }
        if (best) {
            routes[room] = best.name;
        }
    }
    return routes;
}

/**
 * Rewrites `home` — and ONLY `home` — plus the priority floor. `id` keeps
 * encoding the origin room (it is the gap key, not an address), and the
 * resolver names the creep after the donor: cosmetic, stated, accepted.
 */
export function brokerAid(
    demands: SpawnDemand[],
    routes: Record<string, string>,
    config: EmpireConfig
): SpawnDemand[] {
    if (Object.keys(routes).length === 0) {
        return demands;
    }
    return demands.map(demand => {
        const donor = routes[demand.home];
        if (!donor) {
            return demand;
        }
        return { ...demand, home: donor, priority: Math.max(demand.priority, config.aidPriorityFloor) };
    });
}
