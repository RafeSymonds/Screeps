/**
 * The pure remote planner: adopt/drop/reserve decisions plus the remote
 * workforce's demands, from intel + the home snapshot. See docs/design/remotes.md.
 *
 * ## What a remote is
 *
 * A neighboring room we do not own but mine anyway. It costs creeps, travel time
 * and risk; it pays energy. Whether that trade is positive is an actual
 * calculation, not a judgment call, and `remoteProfit` is it: income minus body
 * upkeep amortized over creep lifetimes, minus the decay of energy sitting on the
 * ground between hauler visits. Below `minProfit` the room is not adopted.
 *
 * ## Reserving doubles the yield
 *
 * An unowned, unreserved source regenerates to 1500 rather than 3000 — half rate.
 * Parking a CLAIM creep on the controller lifts it, so reservation roughly doubles
 * a remote's income for the price of one reserver. That is why it is worth it for
 * two-source rooms and usually not for one, and why the miner body differs
 * between the two cases (3 WORK saturates 5 e/t, 5 WORK saturates 10).
 *
 * ## Home comes first, always
 *
 * Remote demands are only emitted while home income is fully staffed. A remote is
 * an *expansion* of a working economy, never a substitute for one — spending the
 * home spawn queue on remote miners while home sources sit unmined trades a sure
 * thing for a speculative one.
 */
import { AssignmentKind } from "shared/assignments";
import { SpawnDemand } from "shared/spawning";
import { SubsystemId } from "shared/subsystems";
import { CreepView, RoomSnapshot } from "shared/views";
import { RoomIntel, RoomType, roomType } from "intel/index";
import { PRIORITY_REMOTE_BASE, PRIORITY_RESERVER, RemotesConfig } from "remotes/config";

export interface RemoteCandidate {
    roomName: string;
    intel: RoomIntel;
    /** approxTravelTiles: linearRoomDistance × 50 + 25 (adapter-computed, tiles). */
    travelTiles: number;
    unsafe: boolean;
    /** Reserved by someone who isn't us (adapter compares usernames) — OUR
     *  reservation must not disqualify our own remote (sim-caught: the bot
     *  un-adopted every remote the moment its reserver succeeded). */
    foreignReserved: boolean;
}

export interface RemotesMemory {
    v: 1;
    rooms: Record<string, { reserved: boolean; adoptedAt: number }>;
}

export interface RemotePlanInput {
    home: RoomSnapshot;
    homeCap: number;
    candidates: RemoteCandidate[];
    slice: RemotesMemory;
    /** Creeps with memory.owner === Remotes and home === this home. */
    roster: CreepView[];
    /** Home income staffed (adapter: home miners ≥ sources && haulers ≥ 2)? */
    homeHealthy: boolean;
    /** The counts behind homeHealthy, so the adapter can say WHY remotes are idle. */
    health: { miners: number; minersNeeded: number; haulers: number; haulersNeeded: number };
    /** How many remotes this home's CPU share affords (shared/budget.ts). Was a
     *  hardcoded 1, because nothing computed what was actually affordable. */
    remotesAllowed: number;
    time: number;
    config: RemotesConfig;
}

/** Unreserved sources yield 5 e/t (3 WORK saturates); reserved 10 (5 WORK). */
const UNRESERVED_RATE = 5;
const RESERVED_RATE = 10;

export function remoteMinerBody(reserved: boolean): BodyPartConstant[] {
    const work = reserved ? 5 : 3;
    const move = Math.ceil((work + 1) / 2);
    return [...new Array<BodyPartConstant>(work).fill(WORK), CARRY, ...new Array<BodyPartConstant>(move).fill(MOVE)];
}

export function reserverBody(homeCap: number, config: RemotesConfig): BodyPartConstant[] {
    return homeCap >= config.reserveSlackCap ? [CLAIM, CLAIM, MOVE, MOVE] : [CLAIM, MOVE];
}

/** [C,M] pairs from the round-trip throughput math at travelTiles. */
export function remoteHaulerBody(rate: number, travelTiles: number): { body: BodyPartConstant[]; count: number } {
    const pairs = 10; // 500 carry, full speed
    const carry = pairs * 50;
    const roundTrip = 2 * travelTiles + 10;
    const count = Math.max(1, Math.ceil((rate * roundTrip) / carry));
    return {
        body: [...new Array<BodyPartConstant>(pairs).fill(CARRY), ...new Array<BodyPartConstant>(pairs).fill(MOVE)],
        count
    };
}

/**
 * Profit (e/t): income − miner/hauler/reserver upkeep − standing-pile decay.
 *
 * Body costs are divided by lifetime (1500 ticks, 600 for a reserver's CLAIM
 * body) to express them as a rate, so everything in the sum is e/t and directly
 * comparable. The pile-decay term is easy to forget and matters: energy waiting
 * on the ground for a hauler loses ceil(amount/1000) per tick, which for one
 * standing pile per source is about 1 e/t of pure loss.
 */
export function remoteProfit(sources: number, reserved: boolean, travelTiles: number): number {
    const rate = sources * (reserved ? RESERVED_RATE : UNRESERVED_RATE);
    const minerCost = (sources * ((reserved ? 5 : 3) * 100 + 50 + Math.ceil(((reserved ? 5 : 3) + 1) / 2) * 50)) / 1500;
    const hauler = remoteHaulerBody(rate, travelTiles);
    const haulerCost = (hauler.count * hauler.body.length * 50) / 1500;
    const reserverCost = reserved ? 650 / 600 : 0;
    // One standing pile per source between hauler visits: ~1 e/t each (ceil/1000).
    const pileDecay = sources * 1;
    return rate - minerCost - haulerCost - reserverCost - pileDecay;
}

export interface RemotePlan {
    adopt: string[];
    drop: string[];
    reserve: Record<string, boolean>;
    demands: SpawnDemand[];
}

/**
 * Why this neighbour is not adoptable — `undefined` means it is. One source of
 * truth for the gate, so "we aren't using remotes at all" has a printable answer
 * instead of being inferred from silence (the adapter logs it).
 */
export function rejectionReason(c: RemoteCandidate, homeCap: number, config: RemotesConfig): string | undefined {
    const type = roomType(c.roomName);
    if (type !== RoomType.Normal) {
        return `${type} room`;
    }
    if (c.intel.owner !== undefined) {
        return `owned by ${c.intel.owner}`;
    }
    if (c.foreignReserved) {
        return `reserved by ${c.intel.reservedBy ?? "someone"}`;
    }
    if (c.unsafe) {
        return "hostiles sighted";
    }
    if (c.intel.sources.length === 0) {
        return "no sources";
    }
    if (homeCap < config.minHomeCap) {
        return `home capacity ${homeCap} < ${config.minHomeCap}`;
    }
    const profit = remoteProfit(c.intel.sources.length, false, c.travelTiles);
    if (profit < config.minProfit) {
        return `profit ${profit.toFixed(1)} e/t < ${config.minProfit}`;
    }
    return undefined;
}

function eligible(c: RemoteCandidate, config: RemotesConfig, homeCap: number): boolean {
    return rejectionReason(c, homeCap, config) === undefined;
}

/**
 * The class-C decision pass: adopt/drop/reserve (recorded in the slice by the
 * adapter). Drops are evaluated before adoptions so a remote that just became
 * ineligible frees its slot in the same tick something better can take it.
 */
export function planAdoption(input: RemotePlanInput): Pick<RemotePlan, "adopt" | "drop" | "reserve"> {
    const { candidates, slice, homeCap, remotesAllowed, config } = input;
    const adopt: string[] = [];
    const drop: string[] = [];
    const reserve: Record<string, boolean> = {};

    for (const name of Object.keys(slice.rooms)) {
        const cand = candidates.find(c => c.roomName === name);
        if (!cand || !eligible(cand, config, homeCap)) {
            drop.push(name);
        }
    }

    const kept = Object.keys(slice.rooms).filter(n => !drop.includes(n));
    if (homeCap >= config.minHomeCap) {
        const pool = candidates
            .filter(c => eligible(c, config, homeCap) && !kept.includes(c.roomName))
            .map(c => ({ c, profit: remoteProfit(c.intel.sources.length, false, c.travelTiles) }))
            .filter(x => x.profit >= config.minProfit)
            .sort((a, b) => b.profit - a.profit || (a.c.roomName < b.c.roomName ? -1 : 1));
        for (const { c } of pool) {
            if (kept.length + adopt.length >= remotesAllowed) {
                break;
            }
            adopt.push(c.roomName);
        }
    }

    for (const name of [...kept, ...adopt]) {
        const cand = candidates.find(c => c.roomName === name);
        const sources = cand?.intel.sources.length ?? 0;
        reserve[name] = sources >= 2 && homeCap >= config.reserveFloorCap;
    }
    return { adopt, drop, reserve };
}

/**
 * The class-B emission pass: gap-diff demands for every adopted, safe remote.
 * Same diff shape as the home planner — desired minus live — but gated twice
 * over: nothing is emitted unless home is healthy, and an individual remote is
 * skipped the moment hostiles are sighted there rather than feeding it creeps.
 */
export function planRemoteDemands(input: RemotePlanInput): SpawnDemand[] {
    const { home, homeCap, candidates, slice, roster, homeHealthy, config } = input;
    const demands: SpawnDemand[] = [];
    if (!homeHealthy || homeCap < config.minHomeCap) {
        return demands;
    }
    for (const [remoteName, state] of Object.entries(slice.rooms)) {
        let slot = 0;
        const cand = candidates.find(c => c.roomName === remoteName);
        if (!cand || cand.unsafe) {
            continue;
        }
        const reserved = state.reserved;
        const rate = cand.intel.sources.length * (reserved ? RESERVED_RATE : UNRESERVED_RATE);

        // Miners: one per source (remote bodies saturate a source alone). Real
        // source ids come from intel (recorded on sight — a packed position would
        // never match the executor's room.sources lookup).
        const sourceIds = cand.intel.sourceIds ?? [];
        const minersById = new Map<string, number>();
        for (const c of roster) {
            const a = (c.memory as { assignment?: { kind?: string; room?: string; sourceId?: string } }).assignment;
            if (a?.kind === AssignmentKind.Mine && a.room === remoteName && a.sourceId !== undefined) {
                minersById.set(a.sourceId, (minersById.get(a.sourceId) ?? 0) + 1);
            }
        }
        for (const sid of sourceIds) {
            if ((minersById.get(sid) ?? 0) < 1) {
                demands.push({
                    id: `rmine:${remoteName}:${sid}`,
                    priority: PRIORITY_REMOTE_BASE + slot * 2,
                    home: home.name,
                    owner: SubsystemId.Remotes,
                    assignment: { kind: AssignmentKind.Mine, room: remoteName, sourceId: sid as Id<Source> },
                    body: remoteMinerBody(reserved)
                });
            }
            slot++;
        }
        // Haulers: throughput count at travel distance, delivering home.
        const hauler = remoteHaulerBody(rate, cand.travelTiles);
        const haulersStaffed = roster.filter(c => {
            const a = (c.memory as { assignment?: { kind?: string; room?: string } }).assignment;
            return a?.kind === AssignmentKind.Haul && a.room === remoteName;
        }).length;
        for (let h = haulersStaffed; h < hauler.count; h++) {
            demands.push({
                id: `rhaul:${remoteName}:${h}`,
                priority: PRIORITY_REMOTE_BASE + 1 + h * 2,
                home: home.name,
                owner: SubsystemId.Remotes,
                assignment: {
                    kind: AssignmentKind.Haul,
                    room: remoteName,
                    sourceId: (cand.intel.sourceIds?.[h % (cand.intel.sourceIds.length || 1)] ?? "") as Id<Source>,
                    to: home.name
                },
                body: hauler.body
            });
        }
        // Reserver.
        if (reserved) {
            const reserverAlive = roster.some(c => {
                const a = (c.memory as { assignment?: { kind?: string; room?: string } }).assignment;
                return a?.kind === AssignmentKind.Reserve && a.room === remoteName;
            });
            if (!reserverAlive) {
                demands.push({
                    id: `rreserve:${remoteName}`,
                    priority: PRIORITY_RESERVER,
                    home: home.name,
                    owner: SubsystemId.Remotes,
                    assignment: { kind: AssignmentKind.Reserve, room: remoteName },
                    body: reserverBody(homeCap, config)
                });
            }
        }
    }
    demands.sort((a, b) => a.priority - b.priority);
    return demands;
}
