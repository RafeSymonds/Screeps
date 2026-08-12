/**
 * The pure build sequencer: BasePlan + current reality → at most a few site
 * creations in BUILD_PRIORITY order, plus stale-site removals. Derived fresh
 * every run — no persisted queue. See docs/design/construction.md.
 *
 * ## No queue, on purpose
 *
 * The obvious design is a persisted build queue. It is also the one that rots:
 * sites get destroyed, RCL changes what is legal, the plan version bumps, and now
 * the queue disagrees with reality and needs reconciliation logic nobody
 * remembers to write. Instead the answer is recomputed from the plan and what
 * exists right now, every run. Stateless means never wrong.
 *
 * ## Why so few sites at a time
 *
 * Open construction sites split builder attention and, worse, decay unfinished
 * energy investment across the room. `maxOpenSites` keeps the crew converging on
 * a few targets so things actually *finish*. The priority walk then decides which
 * few — extensions before roads, spawn before everything.
 *
 * ## Placement legality
 *
 * The engine refuses a site on a tile already holding a non-stackable structure,
 * in BOTH directions — ramparts and roads stack with anything, everything else
 * with nothing. Getting this wrong produces silent per-tick failures rather than
 * an error, which is why the occupancy check is explicit here.
 */
import { BUILD_PRIORITY } from "shared/build";
import { ConstructionSiteView, Pos } from "shared/views";
import { BasePlan } from "layout/plan";
import { ConstructionConfig } from "construction/config";

export interface ConstructionInput {
    rcl: number;
    plan: BasePlan;
    structures: { type: StructureConstant; pos: Pos }[];
    mySites: ConstructionSiteView[];
    config: ConstructionConfig;
}

export interface ConstructionIntents {
    create: { pos: Pos; type: BuildableStructureConstant }[];
    removeSiteIds: Id<ConstructionSite>[];
}

/** Structure types that stack with anything (both directions of the engine's check). */
const STACKABLE = new Set<StructureConstant>([STRUCTURE_RAMPART, STRUCTURE_ROAD]);

const key = (pos: Pos): number => pos.y * 50 + pos.x;

/**
 * Decide this run's site creations and removals.
 *
 * Removals are computed first so the sites they free count toward this run's
 * budget — otherwise clearing an off-plan queue would take one full run per site.
 * Two exceptions keep removal from being destructive: a spawn site in a spawnless
 * room is never removed (it is the room's only way back), and neither is a site
 * already substantially built (that energy is spent either way).
 */
export function sequenceBuilds(input: ConstructionInput): ConstructionIntents {
    const { rcl, plan, structures, mySites, config } = input;

    // --- Stale sites: off-plan (type, pos), minus the spawnless-spawn and
    // sunk-cost exceptions --------------------------------------------------------
    const plannedByType = new Map<StructureConstant, Set<number>>();
    for (const [type, positions] of Object.entries(plan.places)) {
        plannedByType.set(type as StructureConstant, new Set((positions ?? []).map(key)));
    }
    const haveSpawn = structures.some(s => s.type === STRUCTURE_SPAWN);
    const removeSiteIds: Id<ConstructionSite>[] = [];
    const removed = new Set<Id<ConstructionSite>>();
    for (const site of mySites) {
        const onPlan = plannedByType.get(site.type)?.has(key(site.pos)) ?? false;
        if (onPlan) continue;
        if (site.type === STRUCTURE_SPAWN && !haveSpawn) continue;
        if (site.progressTotal > 0 && site.progress / site.progressTotal >= config.keepProgressFraction) continue;
        removeSiteIds.push(site.id);
        removed.add(site.id);
    }

    // --- Budget: ALL my open sites count, minus the ones removed this run ---------
    const openSites = mySites.filter(s => !removed.has(s.id));
    let budget = config.maxOpenSites - openSites.length;

    // --- Priority walk ------------------------------------------------------------
    const create: ConstructionIntents["create"] = [];
    if (budget <= 0) {
        return { create, removeSiteIds };
    }

    const structureCount = new Map<StructureConstant, number>();
    const occupiedObstacle = new Map<number, StructureConstant>();
    const structuresAt = new Map<number, Set<StructureConstant>>();
    for (const s of structures) {
        structureCount.set(s.type, (structureCount.get(s.type) ?? 0) + 1);
        const k = key(s.pos);
        (structuresAt.get(k) ?? structuresAt.set(k, new Set()).get(k)!).add(s.type);
        // Engine rule: anything that isn't rampart/road blocks non-rampart/road
        // placement on its tile (containers included, though walkable).
        if (!STACKABLE.has(s.type)) {
            occupiedObstacle.set(k, s.type);
        }
    }
    const siteCount = new Map<StructureConstant, number>();
    const sitesAt = new Map<number, Set<StructureConstant>>();
    for (const s of openSites) {
        siteCount.set(s.type, (siteCount.get(s.type) ?? 0) + 1);
        const k = key(s.pos);
        (sitesAt.get(k) ?? sitesAt.set(k, new Set()).get(k)!).add(s.type);
    }

    const belowRcl2 = rcl < 2;
    for (const type of BUILD_PRIORITY) {
        if (budget <= 0) break;
        // Below RCL2 the only permitted create is the recovery spawn. A fresh or
        // wiped room has one job — get a spawn up — and every other site would
        // compete for the tiny amount of labor it has.
        if (belowRcl2 && type !== STRUCTURE_SPAWN) continue;
        const allowed = (CONTROLLER_STRUCTURES as Record<string, Record<number, number>>)[type]?.[rcl] ?? 0;
        if (allowed <= 0) continue;
        let total = (structureCount.get(type) ?? 0) + (siteCount.get(type) ?? 0);
        for (const pos of plan.places[type] ?? []) {
            if (budget <= 0 || total >= allowed) break;
            const k = key(pos);
            if (structuresAt.get(k)?.has(type) || sitesAt.get(k)?.has(type)) continue;
            // Blocked: an obstacle structure of another type on the tile — unless the
            // planned type itself stacks (rampart/road place onto occupied tiles fine).
            if (!STACKABLE.has(type) && occupiedObstacle.has(k)) continue;
            create.push({ pos, type });
            total += 1;
            budget -= 1;
        }
    }
    return { create, removeSiteIds };
}
