/**
 * The pure workforce planner: desired roster from first principles, diffed against
 * the live roster, gaps emitted as spawn demands. Upgraders are the residual —
 * every slot not needed to produce or move energy upgrades the controller.
 * See docs/design/economy.md "Workforce model" for every rule and number here.
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
    haulerCarryCapacity,
    minerBody,
    upgraderBody
} from "economy/bodies";

export interface RoomPlanInput {
    room: RoomSnapshot;
    /** My creeps with memory.home === room.name, spawning included. */
    roster: CreepView[];
    /** Walkable tiles adjacent to each source id. */
    sourceSpots: Record<string, number>;
    upgradeSpot: Pos;
    config: EconomyConfig;
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
const PRIORITY_UPGRADER = 100;
const minerPriority = (slot: number): number => 3 + 2 * slot;
const haulerPriority = (slot: number): number => 4 + 2 * slot;

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

export function planRoom(input: RoomPlanInput): SpawnDemand[] {
    const { room, roster, sourceSpots, upgradeSpot, config } = input;
    if (room.sources.length === 0) {
        return [];
    }

    const cap = room.energyCapacityAvailable;
    const demands: SpawnDemand[] = [];
    const anyMinersAlive = roster.some(c => assignmentOf(c)?.kind === AssignmentKind.Mine);
    const anyHaulersAlive = roster.some(c => assignmentOf(c)?.kind === AssignmentKind.Haul);

    const spawnView = room.structures[STRUCTURE_SPAWN]?.[0];
    if (!spawnView) {
        return []; // nowhere to spawn from; demands would be noise
    }

    // Sources ordered closest-to-spawn (ties by id) — priority and round-robin order.
    const sources = [...room.sources].sort((a, b) => {
        const d = chebyshev(a.pos, spawnView.pos) - chebyshev(b.pos, spawnView.pos);
        return d !== 0 ? d : a.id < b.id ? -1 : 1;
    });

    // --- Miners: per source until summed WORK ≥ 5 or seats run out -----------------
    const idealMiner = minerBody(cap);
    const minerWork = idealMiner.filter(p => p === WORK).length;
    let minersDesiredTotal = 0;
    const minerGaps: { sourceId: Id<Source>; slot: number; globalSlot: number }[] = [];
    for (const source of sources) {
        const seats = sourceSpots[source.id] ?? 1;
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

    // --- Upgraders: the residual, floor 1 absolute (a hauler slot is forfeited
    // rather than letting the residual hit zero) ------------------------------------
    let residual = config.maxCreepsPerRoom - minersDesiredTotal - haulersDesiredTotal;
    if (residual < 1) {
        haulersDesiredTotal = Math.max(1, haulersDesiredTotal + residual - 1);
        residual = 1;
    }
    const upgradersDesired = Math.min(residual, config.maxUpgraders);

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
            body: idealMiner,
            ...(anyMinersAlive ? {} : { minBody: MINER_MIN_BODY })
        });
    }

    const haulerGaps: { sourceId: Id<Source>; slot: number; globalSlot: number }[] = [];
    {
        let offset = 0;
        for (const [i, source] of sources.entries()) {
            const staffed = roster.filter(c => {
                const a = assignmentOf(c);
                return a?.kind === AssignmentKind.Haul && a.sourceId === source.id && fillsSlot(c, config.prespawnLead);
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
            ...(anyHaulersAlive ? {} : { minBody: HAULER_MIN_BODY })
        });
    }

    const upgradersStaffed = roster.filter(
        c => assignmentOf(c)?.kind === AssignmentKind.Upgrade && fillsSlot(c, config.prespawnLead)
    ).length;
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
    return demands;
}
