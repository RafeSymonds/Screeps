/**
 * Maintenance repair targets — the decaying things that are NOT fortifications.
 * Pure. See docs/design/economy.md.
 *
 * ## Why repair at all
 *
 * Roads and containers decay on a timer whether or not anyone touches them. Left
 * alone they do not merely degrade, they *vanish* — and then have to be rebuilt
 * from a construction site at full price. Repair is dramatically cheaper than
 * replacement: topping a road back up costs a fraction of the 300 energy and the
 * builder-ticks that laying a new one does, and a container that decays away
 * takes the room's whole mining seat with it until someone notices.
 *
 * So the bot maintains. "Let it break and rebuild" is the expensive option that
 * merely looks like doing less.
 *
 * ## Why fortifications are somebody else's problem
 *
 * Ramparts and walls are handled by defense/fortify.ts against an absolute
 * hit target that scales with RCL and threat. They cannot be judged the same way
 * as everything else: their `hitsMax` is 300 million, so any "repair below X% of
 * max" rule fires permanently and would consume the entire worker force forever.
 * Ordinary structures have small, meaningful maxima, so a fraction is the right
 * measure for them and the wrong one for walls.
 */
import { Pos, RoomSnapshot } from "shared/views";

export interface RepairTarget {
    id: Id<AnyStructure>;
    pos: Pos;
    hits: number;
    hitsMax: number;
}

export interface RepairConfig {
    /** Repair anything below this fraction of its maximum hits. */
    threshold: number;
    /** Below this fraction it is close enough to breaking to outrank new building. */
    critical: number;
    /** Bound the list so a battered room cannot monopolise the workforce. */
    maxTargets: number;
}

export const REPAIR_CONFIG: RepairConfig = {
    threshold: 0.75,
    critical: 0.35,
    maxTargets: 5
};

/** Fortifications are defense/fortify.ts's job — see the header. */
const FORTIFICATION = new Set<StructureConstant>([STRUCTURE_RAMPART, STRUCTURE_WALL]);

/**
 * Damaged structures worth a worker's time, most urgent first.
 *
 * Ordered by *fraction* remaining rather than absolute hits so a road at 10% is
 * treated as more urgent than a container at 40%, which is what "about to
 * disappear" actually means. Ties break on id so every worker converges on the
 * same target instead of spreading thin across many half-repaired structures.
 */
export function computeRepairTargets(room: RoomSnapshot, config: RepairConfig = REPAIR_CONFIG): RepairTarget[] {
    const damaged: RepairTarget[] = [];
    for (const [type, views] of Object.entries(room.structures)) {
        if (FORTIFICATION.has(type as StructureConstant)) continue;
        for (const s of views ?? []) {
            if (s.hitsMax <= 0) continue;
            if (s.hits >= s.hitsMax * config.threshold) continue;
            damaged.push({ id: s.id, pos: s.pos, hits: s.hits, hitsMax: s.hitsMax });
        }
    }
    return damaged
        .sort((a, b) => a.hits / a.hitsMax - b.hits / b.hitsMax || (a.id < b.id ? -1 : 1))
        .slice(0, config.maxTargets);
}

/** Is this target close enough to breaking to outrank starting new construction? */
export function isCriticalRepair(target: RepairTarget, config: RepairConfig = REPAIR_CONFIG): boolean {
    return target.hits < target.hitsMax * config.critical;
}
