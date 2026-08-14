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
import {
    HAULER_MIN_BODY,
    MINER_MIN_BODY,
    bodyCost,
    haulerBodyForCarry,
    haulerCarryCapacity,
    minerBody
} from "economy/bodies";
import { RoomIntel, RoomType, roomType } from "intel/index";
import { PRIORITY_REMOTE_BASE, PRIORITY_RESERVER, RemotesConfig } from "remotes/config";

export interface RemoteCandidate {
    roomName: string;
    intel: RoomIntel;
    /** Room transitions from home over the exit graph (intel/reach.ts). NOT
     *  linear distance, which calls a diagonal neighbour 1 room away when getting
     *  there means crossing two borders. */
    depth: number;
    /** approxTravelTiles: depth × 50 + 25 (adapter-computed, tiles). */
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
    /** How many remote creeps that same share affords, all remotes together —
     *  the constraint that makes distance cost something (shared/budget.ts). */
    remoteCreepsAllowed: number;
    time: number;
    config: RemotesConfig;
}

/** Unreserved sources yield 5 e/t (3 WORK saturates); reserved 10 (5 WORK). */
const UNRESERVED_RATE = 5;
const RESERVED_RATE = 10;

/** The cheapest body that can actually work a remote source, derived rather than
 *  configured. This is the ONLY energy condition on adopting a remote: it is a
 *  capability floor ("can we build the creep at all"), not a wealth policy. */
export const MIN_REMOTE_CAP = bodyCost(MINER_MIN_BODY) + bodyCost(HAULER_MIN_BODY);

/** Remote miners are ordinary miners, sized to the home's capacity like every
 *  other miner. The only remote-specific input is the WORK ceiling: one miner
 *  works a remote source alone, and an unreserved source yields 5 e/t (3 WORK) vs
 *  a reserved one's 10 (5 WORK), so WORK beyond that is bought and wasted. */
export function remoteMinerBody(reserved: boolean, homeCap: number, travelTiles: number): BodyPartConstant[] {
    // travelTiles is what stops this being an ordinary miner in the one way that
    // matters: the home ratio of 1 MOVE per 5 WORK is chosen for a creep that walks
    // ten tiles once, and it makes a remote miner take 625 ticks to reach a room two
    // borders out (economy/bodies.ts).
    return minerBody(homeCap, { maxWork: reserved ? 5 : 3, travelTiles });
}

export function reserverBody(homeCap: number, config: RemotesConfig): BodyPartConstant[] {
    return homeCap >= config.reserveSlackCap ? [CLAIM, CLAIM, MOVE, MOVE] : [CLAIM, MOVE];
}

/** Remote haulers are ordinary haulers. Only the COUNT is remote-specific — it
 *  comes from the round-trip throughput math at this remote's travel distance. */
export function remoteHaulerBody(
    rate: number,
    travelTiles: number,
    homeCap: number
): { body: BodyPartConstant[]; count: number } {
    // Same right-sizing as home hauling: fewest creeps that can hold the required
    // carry, each built to the share it actually hauls rather than to the home's
    // full capacity. Remote round trips are long, so over-provisioning here is the
    // most expensive place to do it.
    const maxCarry = haulerCarryCapacity(homeCap);
    const roundTrip = 2 * travelTiles + 10;
    const carryNeeded = rate * roundTrip;
    const count = Math.max(1, Math.ceil(carryNeeded / maxCarry));
    return { body: haulerBodyForCarry(carryNeeded / count, homeCap), count };
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
export function remoteProfit(sources: number, reserved: boolean, travelTiles: number, homeCap: number): number {
    const rate = sources * (reserved ? RESERVED_RATE : UNRESERVED_RATE);
    const minerCost = (sources * ((reserved ? 5 : 3) * 100 + 50 + Math.ceil(((reserved ? 5 : 3) + 1) / 2) * 50)) / 1500;
    const hauler = remoteHaulerBody(rate, travelTiles, homeCap);
    const haulerCost = (hauler.count * hauler.body.length * 50) / 1500;
    const reserverCost = reserved ? 650 / 600 : 0;
    // One standing pile per source between hauler visits: ~1 e/t each (ceil/1000).
    const pileDecay = sources * 1;
    return rate - minerCost - haulerCost - reserverCost - pileDecay;
}

/** Would we reserve this remote? Extracted because the answer is needed twice —
 *  once to record the decision, once to size the crew that decision implies. */
export function willReserve(c: RemoteCandidate, homeCap: number, config: RemotesConfig): boolean {
    return c.intel.sources.length >= 2 && homeCap >= config.reserveFloorCap;
}

/**
 * How many creeps this remote will keep alive: one miner per source, the haulers
 * its round trip demands, and a reserver if it earns one.
 *
 * This is where distance turns into cost. Income is a property of the room —
 * two sources pay the same whether they are next door or three rooms out — but
 * the haulers needed to move that income scale with the round trip, so a far
 * remote buys the same energy with substantially more creeps. Creeps are what CPU
 * is spent on, so pricing remotes in creeps is what makes the budget notice.
 */
export function remoteCrewSize(c: RemoteCandidate, reserved: boolean, homeCap: number): number {
    const sources = c.intel.sources.length;
    const rate = sources * (reserved ? RESERVED_RATE : UNRESERVED_RATE);
    return sources + remoteHaulerBody(rate, c.travelTiles, homeCap).count + (reserved ? 1 : 0);
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
    // Normally unreachable — the adapter only builds candidates within maxDepth —
    // but the gate is the one place that explains a rejection, so the reason has
    // to exist here or "why isn't that room a remote?" has no printable answer.
    if (c.depth > config.maxDepth) {
        return `${c.depth} rooms out (max ${config.maxDepth})`;
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
    // Capability, not policy: a remote miner body costs MIN_REMOTE_CAP, so below
    // that the home physically cannot field one and adopting would only emit
    // demands the spawn can never fund. There is deliberately NO energy-level
    // *policy* gate above this — remotes are simply worth doing once home mining
    // is staffed, and the count is capped by CPU (budget.md), not by wealth.
    if (homeCap < MIN_REMOTE_CAP) {
        return `home capacity ${homeCap} < ${MIN_REMOTE_CAP} (cannot field a remote miner)`;
    }
    const profit = remoteProfit(c.intel.sources.length, false, c.travelTiles, homeCap);
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
    const { candidates, slice, homeCap, remotesAllowed, remoteCreepsAllowed, config } = input;
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
    const crewOf = (c: RemoteCandidate): number => remoteCrewSize(c, willReserve(c, homeCap, config), homeCap);
    {
        // Already-adopted remotes have first call on the crew budget: dropping a
        // working remote to make room for a speculative one throws away every
        // creep already walking there.
        let crew = kept.reduce((sum, name) => {
            const cand = candidates.find(c => c.roomName === name);
            return sum + (cand ? crewOf(cand) : 0);
        }, 0);
        const pool = candidates
            .filter(c => eligible(c, config, homeCap) && !kept.includes(c.roomName))
            .map(c => ({ c, profit: remoteProfit(c.intel.sources.length, false, c.travelTiles, homeCap) }))
            .filter(x => x.profit >= config.minProfit)
            .sort((a, b) => b.profit - a.profit || (a.c.roomName < b.c.roomName ? -1 : 1));
        for (const { c } of pool) {
            if (kept.length + adopt.length >= remotesAllowed) {
                break;
            }
            const size = crewOf(c);
            // The crew cap governs how many MORE remotes, never whether to have
            // one at all: `remotesAllowed ≥ 1` is the budget table already saying
            // a remote is affordable, and letting a second, finer reading of the
            // same share overrule it would produce a home that is allowed a remote
            // and adopts none. First one in is exempt; everything after pays.
            if (kept.length + adopt.length > 0 && crew + size > remoteCreepsAllowed) {
                continue;
            }
            adopt.push(c.roomName);
            crew += size;
        }
    }

    for (const name of [...kept, ...adopt]) {
        const cand = candidates.find(c => c.roomName === name);
        reserve[name] = cand !== undefined && willReserve(cand, homeCap, config);
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
    // Home first, always — but "home first" means home MINING is staffed, not
    // that home is rich. Once every home source has its miners and the haulers to
    // move what they produce, more energy is strictly better and a remote is the
    // cheapest source of it, so there is no reason to wait.
    if (!homeHealthy || homeCap < MIN_REMOTE_CAP) {
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
                    body: remoteMinerBody(reserved, homeCap, cand.travelTiles),
                    minBody: MINER_MIN_BODY
                });
            }
            slot++;
        }
        // Haulers: throughput count at travel distance, delivering home — but
        // scaled to the miners that have ARRIVED, not to the miners we intend to
        // have. The full fleet is sized for the room's theoretical rate, and that
        // rate is zero until someone is standing on a source: sizing off intent
        // sent eight haulers to a remote with no miner in it, where they shuttled
        // nothing for hundreds of ticks and then came home with a few dozen energy
        // each (sim-observed, and field-reported as "8 haulers in one remote" and
        // "haulers bring back a small percentage of their capacity").
        //
        // Haulers travel at full speed and miners do not, so they would arrive
        // first and wait regardless; ramping with arrivals costs nothing real.
        const minersOnStation = roster.filter(c => {
            const a = (c.memory as { assignment?: { kind?: string; room?: string } }).assignment;
            return a?.kind === AssignmentKind.Mine && a.room === remoteName && c.pos.roomName === remoteName;
        }).length;
        const hauler = remoteHaulerBody(rate, cand.travelTiles, homeCap);
        const sourceCount = Math.max(1, sourceIds.length);
        const haulersWanted = Math.min(
            hauler.count,
            Math.ceil((hauler.count * Math.min(minersOnStation, sourceCount)) / sourceCount)
        );
        const haulersStaffed = roster.filter(c => {
            const a = (c.memory as { assignment?: { kind?: string; room?: string } }).assignment;
            return a?.kind === AssignmentKind.Haul && a.room === remoteName;
        }).length;
        for (let h = haulersStaffed; h < haulersWanted; h++) {
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
                body: hauler.body,
                minBody: HAULER_MIN_BODY
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
