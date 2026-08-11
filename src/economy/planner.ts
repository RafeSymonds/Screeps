/**
 * The pure workforce planner: desired roster from first principles, diffed against
 * the live roster, gaps emitted as spawn demands. Upgraders are the residual —
 * every slot not needed to produce or move energy upgrades the controller.
 * See docs/design/economy.md "Workforce model" for every rule and number here.
 */
import { Assignment, AssignmentKind } from "shared/assignments";
import { isInvestmentSite } from "shared/build";
import { SpawnDemand } from "shared/spawning";
import { SubsystemId } from "shared/subsystems";
import { CreepView, Pos, RoomSnapshot } from "shared/views";
import { EconomyConfig } from "economy/config";
import {
    HAULER_MIN_BODY,
    MINER_MIN_BODY,
    builderBody,
    haulerBody,
    haulerCarryCapacity,
    minerBody,
    upgraderBody
} from "economy/bodies";

export interface RoomPlanInput {
    room: RoomSnapshot;
    /** My creeps with memory.home === room.name, spawning included. */
    roster: CreepView[];
    /** My creeps in this room with NO home — seeded/recovered worlds (economy.md). */
    orphans: CreepView[];
    /** Walkable tiles adjacent to each source id. */
    sourceSpots: Record<string, number>;
    upgradeSpot: Pos;
    /** Emit the rebuild skeleton for a spawnless room? FALSE while expansion is
     *  pioneering it — that bootstrap already has an owner, and running both
     *  would double-load the sponsor's spawn queue with two uncoordinated
     *  crews. Rebuild is for a room that LOST its spawn (empire.md Crippled). */
    allowRebuild: boolean;
    config: EconomyConfig;
}

export interface RoomPlan {
    /** Priority-ordered spawn demands for gaps no orphan or conversion could fill. */
    demands: SpawnDemand[];
    /** Orphan → slot fills; the adapter writes home/owner/assignment. */
    adoptions: { name: string; assignment: Assignment }[];
    /** Owner rewrites of its own creeps (surplus upgraders → Build while sites are
     *  open — economy.md rule 3); the adapter writes assignment only. */
    reassignments: { name: string; assignment: Assignment }[];
}

const SOURCE_RATE = 10; // 3000 energy / 300-tick regen
const WORK_TO_SATURATE = 5; // 5 WORK × 2 e/t = 10 e/t

/**
 * Priorities interleave income roles pairwise BY ABSOLUTE SLOT — miner slot s at
 * 3+2s, hauler slot s at 4+2s — so haul capacity grows in step with mining
 * capacity. Slot indices are global across sources and count staffed creeps, so
 * filled slots permanently consume the low priorities; indexing by gap-list
 * position instead is memoryless and re-elects "next miner" every replan (sim
 * caught exactly that: six miners, one ferry, energy rotting on the ground).
 */
const PRIORITY_BOOTSTRAP_MINER = 1;
const PRIORITY_BOOTSTRAP_HAULER = 2;
const PRIORITY_BUILDER = 50;
const PRIORITY_UPGRADER = 100;
const minerPriority = (slot: number): number => 3 + 2 * slot;
const haulerPriority = (slot: number): number => 4 + 2 * slot;

/** Can this body do this job? (Adoption viability — economy.md.) */
function bodyFits(creep: CreepView, kind: AssignmentKind): boolean {
    const has = (part: BodyPartConstant): boolean => (creep.bodyCounts[part] ?? 0) > 0;
    switch (kind) {
        case AssignmentKind.Mine:
            return has(WORK) && has(MOVE);
        case AssignmentKind.Haul:
            return has(CARRY) && has(MOVE);
        case AssignmentKind.Build:
        case AssignmentKind.Upgrade:
            return has(WORK) && has(CARRY) && has(MOVE);
        default:
            return false;
    }
}

function chebyshev(a: Pos, b: Pos): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

function bodyParts(creep: CreepView): number {
    return Object.values(creep.bodyCounts).reduce((s, n) => s + n, 0);
}

/** Pre-spawn aging: a creep this close to death no longer fills its slot. */
function fillsSlot(creep: CreepView, lead: number): boolean {
    if (creep.ticksToLive === undefined) {
        return true; // spawning
    }
    return creep.ticksToLive >= 3 * bodyParts(creep) + lead;
}

function assignmentOf(creep: CreepView): Assignment | undefined {
    return (creep.memory as { assignment?: Assignment }).assignment;
}

/**
 * Does this creep actually carry enough to count as a hauler slot? An adopted
 * generalist has ONE CARRY — 50 of the ~250 a real hauler moves. Counting it as
 * staffed froze the roster at a fifth of the haul capacity the formula asked
 * for, and assignments are for life, so it never corrected: sim-measured, two
 * "haulers" against 20 e/t of production and 2.4k energy rotting on the floor.
 */
function fillsHaulSlot(creep: CreepView, cap: number): boolean {
    const carry = (creep.bodyCounts[CARRY] ?? 0) * CARRY_CAPACITY;
    return carry * 3 >= haulerCarryCapacity(cap);
}

/** Miner + hauler + builders, all at bootstrap size: enough labor to rebuild a
 *  spawn from a donor room's spawn queue. See economy.md / empire.md. */
function rebuildSkeleton(room: RoomSnapshot, config: EconomyConfig): SpawnDemand[] {
    const source = room.sources[0];
    if (!source) {
        return [];
    }
    const demands: SpawnDemand[] = [
        {
            id: `mine:${room.name}:rebuild`,
            priority: PRIORITY_BOOTSTRAP_MINER,
            home: room.name,
            owner: SubsystemId.Economy,
            assignment: { kind: AssignmentKind.Mine, room: room.name, sourceId: source.id },
            body: minerBody(300),
            minBody: MINER_MIN_BODY
        },
        {
            id: `haul:${room.name}:rebuild`,
            priority: PRIORITY_BOOTSTRAP_HAULER,
            home: room.name,
            owner: SubsystemId.Economy,
            assignment: { kind: AssignmentKind.Haul, room: room.name, sourceId: source.id },
            body: haulerBody(300),
            minBody: HAULER_MIN_BODY
        }
    ];
    for (let slot = 0; slot < config.builders; slot++) {
        demands.push({
            id: `build:${room.name}:rebuild:${slot}`,
            priority: PRIORITY_BUILDER,
            home: room.name,
            owner: SubsystemId.Economy,
            assignment: { kind: AssignmentKind.Build, room: room.name },
            body: builderBody(300)
        });
    }
    return demands;
}

export function planRoom(input: RoomPlanInput): RoomPlan {
    const { room, roster, orphans, sourceSpots, upgradeSpot, allowRebuild, config } = input;
    if (room.sources.length === 0) {
        return { demands: [], adoptions: [], reassignments: [] };
    }

    const demands: SpawnDemand[] = [];
    const minersAlive = roster.filter(c => assignmentOf(c)?.kind === AssignmentKind.Mine).length;
    const haulersAlive = roster.filter(c => assignmentOf(c)?.kind === AssignmentKind.Haul).length;
    const anyMinersAlive = minersAlive > 0;
    const anyHaulersAlive = haulersAlive > 0;

    // Bootstrap sizing (economy.md, sim-caught in wiped-base): while income staffing
    // is below floor, size EVERY body to 300 — a wiped high-cap room's full-cap
    // bodies drain the banked stores once and then wedge the head-of-line queue on
    // the spawn's 300-cap self-regen. Capacity-sized bodies are earned, not assumed.
    const bootstrapping = minersAlive < room.sources.length || haulersAlive < Math.min(2, room.sources.length);
    const cap = bootstrapping ? Math.min(room.energyCapacityAvailable, 300) : room.energyCapacityAvailable;

    const spawnView = room.structures[STRUCTURE_SPAWN]?.[0];
    if (!spawnView) {
        // M6: a spawnless owned room emits the REBUILD SKELETON rather than
        // bailing. It cannot spawn these itself — by definition — so empire's aid
        // pass re-homes them to a donor; layout kept the plan, construction places
        // spawn[0] under its spawnless exception, and these builders rebuild it.
        // (Returning [] here made brokerAid a guaranteed no-op: the canonical
        // crippled room emitted nothing to broker.)
        return {
            demands: allowRebuild ? rebuildSkeleton(room, config) : [],
            adoptions: [],
            reassignments: []
        };
    }

    // Sources ordered closest-to-spawn (ties by id) — priority and round-robin order.
    const sources = [...room.sources].sort((a, b) => {
        const d = chebyshev(a.pos, spawnView.pos) - chebyshev(b.pos, spawnView.pos);
        return d !== 0 ? d : a.id < b.id ? -1 : 1;
    });

    // --- Miners: per source until summed WORK ≥ 5 or seats run out -----------------
    // A source served by a link gets the one-CARRY variant: someone has to put
    // energy INTO the link, and that is the miner beside it (economy.md "Links").
    const linkServes = (source: { pos: Pos }): boolean =>
        (room.structures[STRUCTURE_LINK] ?? []).some(l => chebyshev(l.pos, source.pos) <= 2);
    // Saturation is computed from the body this source will ACTUALLY get: the
    // link variant spends a slot on CARRY, so it carries less WORK and may need
    // one more miner to saturate.
    const bodyFor = (source: { pos: Pos }): BodyPartConstant[] => minerBody(cap, linkServes(source));
    let minersDesiredTotal = 0;
    const minerGaps: { sourceId: Id<Source>; slot: number; globalSlot: number }[] = [];
    for (const source of sources) {
        const seats = sourceSpots[source.id] ?? 1;
        const minerWork = bodyFor(source).filter(p => p === WORK).length;
        const desired = Math.min(seats, Math.ceil(WORK_TO_SATURATE / minerWork));
        const offset = minersDesiredTotal;
        minersDesiredTotal += desired;
        const staffed = roster.filter(c => {
            const a = assignmentOf(c);
            return a?.kind === AssignmentKind.Mine && a.sourceId === source.id && fillsSlot(c, config.prespawnLead);
        }).length;
        for (let slot = staffed; slot < desired; slot++) {
            minerGaps.push({ sourceId: source.id, slot, globalSlot: offset + slot });
        }
    }

    // --- Haulers: global throughput count, distributed round-robin -----------------
    const carry = haulerCarryCapacity(cap);
    const perSourceNeed = sources.map(s => {
        const dist = chebyshev(s.pos, upgradeSpot);
        const roundTrip = 2 * dist * config.plainsFactor + config.tripOverhead;
        return (SOURCE_RATE * roundTrip) / carry;
    });
    let haulersDesiredTotal = Math.max(1, Math.ceil(perSourceNeed.reduce((a, b) => a + b, 0)));

    // --- Builders: a full crew while INVESTMENT sites are open; a 1-builder
    // maintenance crew while only maintenance work (roads/ramparts/walls) exists.
    // Maintenance sites recur forever, so they must not throttle the economy
    // (economy.md rule 3; sim-caught livelock) --------------------------------------
    const investmentSitesOpen = room.myConstructionSites.some(s => isInvestmentSite(s.type));
    const maintenanceWork = room.myConstructionSites.length > 0;
    const buildersDesired = investmentSitesOpen ? config.builders : maintenanceWork ? 1 : 0;

    // --- Upgraders: the residual, floor 1 absolute (a hauler slot is forfeited
    // rather than letting the residual hit zero). While investment sites are open
    // the cap is 1: construction throttles upgrading at the energy level -------------
    let residual = config.maxCreepsPerRoom - minersDesiredTotal - haulersDesiredTotal - buildersDesired;
    if (residual < 1) {
        haulersDesiredTotal = Math.max(1, haulersDesiredTotal + residual - 1);
        residual = 1;
    }
    const upgradersDesired = Math.min(residual, investmentSitesOpen ? 1 : config.maxUpgraders);

    // Distribute hauler targets per source by largest remainder against the total.
    const haulerTargets = sources.map(() => 0);
    {
        const total = haulersDesiredTotal;
        const sum = perSourceNeed.reduce((a, b) => a + b, 0);
        let assigned = 0;
        const remainders = perSourceNeed.map((need, i) => {
            const share = sum > 0 ? (need / sum) * total : total / sources.length;
            haulerTargets[i] = Math.floor(share);
            assigned += haulerTargets[i];
            return { i, frac: share - haulerTargets[i] };
        });
        remainders.sort((a, b) => b.frac - a.frac);
        for (let k = 0; assigned < total; k++, assigned++) {
            haulerTargets[remainders[k % remainders.length].i]++;
        }
    }

    // --- Emit demands ---------------------------------------------------------------
    for (const gap of minerGaps) {
        demands.push({
            id: `mine:${room.name}:${gap.sourceId}:${gap.slot}`,
            priority: gap.globalSlot === 0 ? PRIORITY_BOOTSTRAP_MINER : minerPriority(gap.globalSlot),
            home: room.name,
            owner: SubsystemId.Economy,
            assignment: { kind: AssignmentKind.Mine, room: room.name, sourceId: gap.sourceId },
            body: bodyFor(sources.find(s => s.id === gap.sourceId) ?? sources[0]),
            // Same rule: a room short of miners must not wait on a body it cannot
            // fund — an unmined source earns nothing at all.
            ...(minersAlive < room.sources.length ? { minBody: MINER_MIN_BODY } : {})
        });
    }

    const haulerGaps: { sourceId: Id<Source>; slot: number; globalSlot: number }[] = [];
    {
        let offset = 0;
        for (const [i, source] of sources.entries()) {
            const staffed = roster.filter(c => {
                const a = assignmentOf(c);
                return (
                    a?.kind === AssignmentKind.Haul &&
                    a.sourceId === source.id &&
                    fillsSlot(c, config.prespawnLead) &&
                    fillsHaulSlot(c, cap)
                );
            }).length;
            for (let slot = staffed; slot < haulerTargets[i]; slot++) {
                haulerGaps.push({ sourceId: source.id, slot, globalSlot: offset + slot });
            }
            offset += haulerTargets[i];
        }
    }
    for (const gap of haulerGaps) {
        demands.push({
            id: `haul:${room.name}:${gap.sourceId}:${gap.slot}`,
            priority:
                gap.globalSlot === 0 && !anyHaulersAlive ? PRIORITY_BOOTSTRAP_HAULER : haulerPriority(gap.globalSlot),
            home: room.name,
            owner: SubsystemId.Economy,
            assignment: { kind: AssignmentKind.Haul, room: room.name, sourceId: gap.sourceId },
            body: haulerBody(cap),
            // Critically short → take what the room can afford NOW. Saving up for
            // an ideal body is right when the role is nearly staffed; when it is
            // less than half staffed the queue just blocks (or, with bounded
            // patience, hands the slot to a cheap upgrader) while energy rots on
            // the ground — sim-measured: 2 haulers of 7, 3,961 energy on the floor
            // and climbing, 15 upgraders/builders.
            ...(haulersAlive * 2 < haulersDesiredTotal ? { minBody: HAULER_MIN_BODY } : {})
        });
    }

    const buildersStaffed = roster.filter(
        c => assignmentOf(c)?.kind === AssignmentKind.Build && fillsSlot(c, config.prespawnLead)
    ).length;

    // --- Upgrader → builder conversion: surplus live upgraders fill builder gaps
    // before any spawn does (instant, free; a spawn cycle lags a regime change by a
    // whole generation). Freshest first, deterministic. Economy.md rule 3. ----------
    const reassignments: RoomPlan["reassignments"] = [];
    const liveUpgraders = roster.filter(
        c => assignmentOf(c)?.kind === AssignmentKind.Upgrade && fillsSlot(c, config.prespawnLead)
    );
    let buildersFilled = buildersStaffed;
    if (buildersFilled < buildersDesired && liveUpgraders.length > upgradersDesired) {
        const surplus = [...liveUpgraders].sort(
            (a, b) => (b.ticksToLive ?? Infinity) - (a.ticksToLive ?? Infinity) || (a.name < b.name ? -1 : 1)
        );
        const convertible = Math.min(liveUpgraders.length - upgradersDesired, buildersDesired - buildersFilled);
        for (const creep of surplus.slice(0, convertible)) {
            reassignments.push({ name: creep.name, assignment: { kind: AssignmentKind.Build, room: room.name } });
            buildersFilled++;
        }
    }
    for (let slot = buildersFilled; slot < buildersDesired; slot++) {
        demands.push({
            id: `build:${room.name}:${slot}`,
            priority: PRIORITY_BUILDER,
            home: room.name,
            owner: SubsystemId.Economy,
            assignment: { kind: AssignmentKind.Build, room: room.name },
            body: builderBody(cap)
        });
    }

    const upgradersStaffed = liveUpgraders.length - reassignments.length;
    for (let slot = upgradersStaffed; slot < upgradersDesired; slot++) {
        demands.push({
            id: `upgrade:${room.name}:${slot}`,
            priority: PRIORITY_UPGRADER,
            home: room.name,
            owner: SubsystemId.Economy,
            assignment: { kind: AssignmentKind.Upgrade, room: room.name },
            body: upgraderBody(cap)
        });
    }

    demands.sort((a, b) => a.priority - b.priority);

    // --- Orphan adoption: fill gaps with existing unowned bodies before spawning ---
    const adoptions: RoomPlan["adoptions"] = [];
    if (orphans.length > 0) {
        const unused = [...orphans].sort((a, b) => (a.name < b.name ? -1 : 1));
        const remaining: SpawnDemand[] = [];
        for (const demand of demands) {
            const i = unused.findIndex(c => bodyFits(c, demand.assignment.kind));
            if (i === -1) {
                remaining.push(demand);
            } else {
                adoptions.push({ name: unused[i].name, assignment: demand.assignment });
                unused.splice(i, 1);
            }
        }
        return { demands: remaining, adoptions, reassignments };
    }
    return { demands, adoptions, reassignments };
}
