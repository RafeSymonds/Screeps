/**
 * The pure workforce planner: desired roster from first principles, diffed against
 * the live roster, gaps emitted as spawn demands. Upgraders are the residual —
 * every slot not needed to produce or move energy upgrades the controller.
 * See docs/design/economy.md "Workforce model" for every rule and number here.
 *
 * ## Derive, don't configure
 *
 * Nothing here is a hand-tuned headcount. Miners come from source saturation
 * (a source yields 10 e/t, one WORK harvests 2 e/t, so 5 WORK saturates it and
 * anything beyond is waste). Haulers come from throughput: production rate times
 * round-trip length divided by carry capacity. Builders come from whether real
 * construction is open. Whatever is left over upgrades the controller.
 *
 * That matters because rooms differ — two sources or one, spawn adjacent to a
 * source or twenty tiles away, RCL2 or RCL8. A hardcoded roster is right for the
 * room it was tuned in and wrong everywhere else; a derived one is right in a
 * room nobody has seen yet, which is the case that actually comes up.
 *
 * ## Plan is a diff, not a command
 *
 * Every tick this recomputes the *desired* roster and subtracts the live one. The
 * output is only the gap — plus adoptions (an existing homeless creep can fill a
 * slot instantly, no spawn cycle) and reassignments (a surplus upgrader becomes a
 * builder for free). Spawning is the last resort, because it is the slowest and
 * the only one that costs energy.
 *
 * ## Slot indices are absolute
 *
 * Priorities are computed from a creep's *global slot number*, not its position
 * in the gap list. That distinction was a real bug: gap-list position is
 * memoryless, so every replan re-elected "the next miner" as top priority and the
 * bot spawned six miners and one hauler while energy rotted on the ground. With
 * absolute slots, filled slots permanently consume the low priority numbers and
 * the ladder advances.
 */
import { Assignment, AssignmentKind } from "shared/assignments";
import { SpawnDemand } from "shared/spawning";
import { SubsystemId } from "shared/subsystems";
import { CreepView, Pos, RoomSnapshot } from "shared/views";
import { EconomyConfig } from "economy/config";
import {
    HAULER_MIN_BODY,
    MINER_MIN_BODY,
    haulerBody,
    haulerBodyForCarry,
    haulerCarryCapacity,
    minerBody,
    workerBody
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
    /** This room's CPU-derived workforce cap (shared/budget.ts, principle 8).
     *  Replaces the old fixed `config.maxCreepsPerRoom`, which was sized for a
     *  world with exactly one room and did not tighten when M6 added a second. */
    creepsAllowed: number;
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
/** UPGRADE_CONTROLLER_POWER: one WORK part spends 1 energy/tick upgrading. This is
 *  the room's steady-state sink — building spends 5×, but only while sites exist. */
const UPGRADE_ENERGY_PER_WORK = 1;
const WORK_TO_SATURATE = 5; // 5 WORK × 2 e/t = 10 e/t — more WORK on one source is wasted

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
const PRIORITY_WORKER = 50;
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
        case AssignmentKind.Work:
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
function fillsHaulSlot(creep: CreepView, wantCarry: number): boolean {
    const carry = (creep.bodyCounts[CARRY] ?? 0) * CARRY_CAPACITY;
    return carry * 3 >= wantCarry;
}

/** Miner + hauler + two workers, all at bootstrap size: enough labor to rebuild
 *  a spawn from a donor room's spawn queue. See economy.md / empire.md. */
function rebuildSkeleton(room: RoomSnapshot): SpawnDemand[] {
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
    for (let slot = 0; slot < 2; slot++) {
        demands.push({
            id: `work:${room.name}:rebuild:${slot}`,
            priority: PRIORITY_WORKER,
            home: room.name,
            owner: SubsystemId.Economy,
            assignment: { kind: AssignmentKind.Work, room: room.name },
            body: workerBody(300)
        });
    }
    return demands;
}

/**
 * Plan one room's workforce. Pure — takes views and config, returns decisions;
 * the adapter in `economy/index.ts` is what writes memory and queues spawns.
 *
 * Order of the computation, each stage feeding the next: miners (per source, to
 * saturation) → haulers (throughput for those miners) → builders (is there real
 * construction?) → upgraders (whatever headcount remains). Then the diff against
 * the live roster, then adoption of any homeless creeps that fit.
 */
export function planRoom(input: RoomPlanInput): RoomPlan {
    const { room, roster, orphans, sourceSpots, upgradeSpot, creepsAllowed, allowRebuild, config } = input;
    if (room.sources.length === 0) {
        return { demands: [], adoptions: [], reassignments: [] };
    }

    const demands: SpawnDemand[] = [];
    const minersAlive = roster.filter(c => assignmentOf(c)?.kind === AssignmentKind.Mine).length;
    const haulersAlive = roster.filter(c => assignmentOf(c)?.kind === AssignmentKind.Haul).length;
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
            demands: allowRebuild ? rebuildSkeleton(room) : [],
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
    const bodyFor = (source: { pos: Pos }): BodyPartConstant[] => minerBody(cap, { withLink: linkServes(source) });
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
    // Required carry CAPACITY (not creep count): rate × round-trip, per source.
    const maxCarry = haulerCarryCapacity(cap);
    const perSourceCarry = sources.map(s => {
        const dist = chebyshev(s.pos, upgradeSpot);
        const roundTrip = 2 * dist * config.plainsFactor + config.tripOverhead;
        return SOURCE_RATE * roundTrip;
    });
    const carryNeeded = perSourceCarry.reduce((a, b) => a + b, 0);
    // Fewest creeps that can hold it, then RIGHT-SIZE each one to the share it
    // actually has to carry. Rounding the count up while keeping bodies at max
    // capacity is how a room ends up with a bunch of oversized haulers doing a
    // fraction of their capacity — 2 × 900 carry for a 1050-carry job.
    let haulersDesiredTotal = Math.max(1, Math.ceil(carryNeeded / maxCarry));
    const carryPerHauler = carryNeeded / haulersDesiredTotal;
    const perSourceNeed = perSourceCarry.map(c => c / maxCarry);

    // --- Workers: ONE role that builds, upgrades and, where there is no logistics
    // yet, harvests for itself. The build/upgrade split is not planned here at all
    // — a worker looks at the room each tick and does the most valuable thing
    // available, so the split tracks reality continuously instead of being guessed
    // a creep-generation in advance.
    //
    // Sized to CONSUME WHAT THE ROOM PRODUCES. Miners come from source saturation
    // and haulers from throughput; workers were the one role derived from nothing
    // at all — just whatever headcount the CPU allowance had left. That is a
    // production/consumption imbalance waiting to happen, and it happened: a
    // worker's sink is its WORK parts (1 energy/tick each while upgrading), so at
    // capacity 300 a worker consumes 1 e/t and eight of them consumed 8 e/t
    // against two sources producing 20. The surplus piled up at 12 e/t forever.
    //
    // Deriving it cuts both ways, which is the point: at capacity 1300 a worker is
    // 6 WORK, so the same 20 e/t needs four workers, not eight — and the slots go
    // back to the CPU budget instead of crowding the controller.
    const workPerWorker = Math.max(1, workerBody(cap).filter(part => part === WORK).length);
    const production = room.sources.length * SOURCE_RATE;
    const workersForProduction = Math.ceil(production / (workPerWorker * UPGRADE_ENERGY_PER_WORK));

    // Income first is the invariant — a room can build more workers later, but
    // workers cannot fix an unstaffed source.
    let workersDesired = Math.min(
        workersForProduction,
        creepsAllowed - minersDesiredTotal - haulersDesiredTotal,
        config.maxWorkers
    );

    // When the allowance cannot cover income either, the squeeze order is
    // investment-before-income: workers yield first, haulers only after workers
    // are gone. Getting this backwards is a room-killer and it was live — with the
    // allowance at 9 against 4 miners / 7 haulers / 4 builders, the old rule put
    // the entire shortfall on haulers and cut them to ONE while leaving four
    // builders untouched. A room that mines but cannot move what it mines piles
    // energy on the floor and starves its own spawn.
    if (workersDesired < 1) {
        haulersDesiredTotal = Math.max(1, haulersDesiredTotal + workersDesired - 1);
        workersDesired = 1;
    }

    // Distribute hauler targets per source by largest remainder (the apportionment
    // method): floor each source's fair share, then hand the leftover seats to the
    // sources with the largest fractional claim. Rounding each independently would
    // over- or under-shoot the total the throughput formula actually asked for.
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
                    fillsHaulSlot(c, carryPerHauler)
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
            body: haulerBodyForCarry(carryPerHauler, cap),
            // Critically short → take what the room can afford NOW. Saving up for
            // an ideal body is right when the role is nearly staffed; when it is
            // less than half staffed the queue just blocks (or, with bounded
            // patience, hands the slot to a cheap upgrader) while energy rots on
            // the ground — sim-measured: 2 haulers of 7, 3,961 energy on the floor
            // and climbing, 15 upgraders/builders.
            ...(haulersAlive * 2 < haulersDesiredTotal ? { minBody: HAULER_MIN_BODY } : {})
        });
    }

    const workersStaffed = roster.filter(
        c => assignmentOf(c)?.kind === AssignmentKind.Work && fillsSlot(c, config.prespawnLead)
    ).length;
    for (let slot = workersStaffed; slot < workersDesired; slot++) {
        demands.push({
            id: `work:${room.name}:${slot}`,
            priority: PRIORITY_WORKER,
            home: room.name,
            owner: SubsystemId.Economy,
            assignment: { kind: AssignmentKind.Work, room: room.name },
            body: workerBody(cap)
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
        return { demands: remaining, adoptions, reassignments: [] };
    }
    return { demands, adoptions, reassignments: [] };
}
