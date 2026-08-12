/**
 * Pure spawn resolution: priority-sorted demands against free spawns and one
 * shared energy pool, with deliberate head-of-line blocking and the minBody
 * bootstrap fallback. See docs/design/spawn.md "Resolution policy".
 *
 * ## Why anything blocks at all
 *
 * Spawning is the only place where "wait and do nothing" is often the right move.
 * A room whose ideal hauler costs 1800 and which currently holds 800 should
 * *accumulate*, not spend the 800 on a body that will underperform for its whole
 * 1500-tick life. Head-of-line blocking is that accumulation: the top demand
 * holds the queue closed while extensions refill.
 *
 * ## Why the block is time-bounded
 *
 * Unbounded, that same mechanism is starvation. A sponsor hovering around 800
 * energy sat behind its own 1800-energy hauler demand indefinitely and never
 * funded the 650-energy claimer queued behind it — expansion recorded a claim it
 * could not act on for an entire run. `BLOCK_PATIENCE` bounds the hold, so the
 * queue saves up when saving up is working and gives up when it plainly isn't.
 *
 * The wait record lives in Memory rather than the heap because the patience
 * window (150 ticks) is far longer than the interval between global resets, and a
 * heap-based timer would restart on every one of them — which is exactly
 * unbounded blocking wearing a bound.
 *
 * ## minBody
 *
 * The other escape hatch, and the one that applies when the shortage is critical
 * rather than merely inconvenient. A demand carrying `minBody` accepts a smaller
 * body immediately instead of waiting: an unmined source earns nothing, so a bad
 * miner now beats a good miner later. Callers attach it deliberately — economy
 * only sets it while a role is below half staffed.
 */
import { SpawnDemand } from "shared/spawning";
import { RoomSnapshot } from "shared/views";
import { bodyCost, MAX_BODY_PARTS } from "economy/bodies";

/** How long the queue may hold for one unaffordable demand before letting the
 *  work behind it through (spawn.md "Resolution policy"). Holding is load-bearing
 *  — it is how a room saves up for a body it cannot afford this tick — so the
 *  bound must be generous enough to cover real accumulation (a room refilling
 *  extensions needs tens of ticks) and tight enough that a demand the room can
 *  NEVER fund does not starve everything behind it forever. */
export const BLOCK_PATIENCE = 150;

/** Persisted in the spawn slice: which demand the queue is waiting on, since when. */
export interface SpawnState {
    blockedId?: string;
    blockedSince?: number;
}

export interface SpawnResolution {
    decisions: SpawnDecision[];
    state: SpawnState;
}

export interface SpawnDecision {
    spawnId: Id<StructureSpawn>;
    demand: SpawnDemand;
    body: BodyPartConstant[];
    name: string;
}

/**
 * Decide what each free spawn should build this tick.
 *
 * All spawns in a room draw from ONE energy pool (`room.energyAvailable`), so
 * `remainingEnergy` is decremented as decisions are made — two spawns must not
 * both commit the same 300 energy. Returns the decisions plus the updated wait
 * record, which the adapter persists.
 */
export function resolveSpawns(
    demands: SpawnDemand[],
    room: RoomSnapshot,
    time: number,
    state: SpawnState = {}
): SpawnResolution {
    const freeSpawns = (room.structures[STRUCTURE_SPAWN] ?? []).filter(s => s.spawning !== true);
    if (freeSpawns.length === 0 || demands.length === 0) {
        return { decisions: [], state };
    }

    const sorted = [...demands].sort((a, b) => a.priority - b.priority); // stable: emission order breaks ties
    const decisions: SpawnDecision[] = [];
    let blocked: { id: string; since: number } | undefined =
        state.blockedId !== undefined && state.blockedSince !== undefined
            ? { id: state.blockedId, since: state.blockedSince }
            : undefined;
    let held = false;
    let remainingEnergy = room.energyAvailable;
    let next = 0;
    const namesUsed = new Set<string>();

    for (const spawn of freeSpawns) {
        let demand: SpawnDemand | undefined;
        let body: BodyPartConstant[] | undefined;

        // Walk the queue for THIS spawn: hold the line for a demand we are close to
        // affording, skip one that is far out of reach.
        while (next < sorted.length) {
            const candidate = sorted[next];
            const cost = bodyCost(candidate.body);

            // Malformed body blocks the line like an unaffordable one (defense in depth).
            if (candidate.body.length > MAX_BODY_PARTS || cost > room.energyCapacityAvailable) {
                break;
            }
            if (remainingEnergy >= cost) {
                demand = candidate;
                body = candidate.body;
                break;
            }
            if (candidate.minBody && remainingEnergy >= bodyCost(candidate.minBody)) {
                demand = candidate;
                body = candidate.minBody;
                break;
            }
            // TIME-BOUNDED head-of-line blocking. Holding is load-bearing: it is how
            // a room saves for a body it cannot afford this tick (sim-caught — an
            // infra-built room with no real haulers recovers only by accumulating
            // toward one). But an UNBOUNDED hold is starvation: an RCL5 sponsor
            // hovering at ~800 energy sat behind its own 1800-energy hauler demand
            // and never built a 650-energy claimer, so expansion recorded a claim it
            // could not act on for an entire run. So: hold, but only for a while.
            const waited = blocked?.id === candidate.id ? time - blocked.since : 0;
            if (waited > BLOCK_PATIENCE) {
                next++; // waited long enough — let the work behind it through
                continue;
            }
            blocked = { id: candidate.id, since: blocked?.id === candidate.id ? blocked.since : time };
            held = true;
            break;
        }
        if (!demand || !body) {
            break;
        }

        let name = `${demand.assignment.kind}_${demand.home}_${time}`;
        for (let n = 1; namesUsed.has(name); n++) {
            name = `${demand.assignment.kind}_${demand.home}_${time}_${n}`;
        }
        namesUsed.add(name);

        decisions.push({ spawnId: spawn.id as Id<StructureSpawn>, demand, body, name });
        remainingEnergy -= bodyCost(body);
        next++;
    }
    // Keep the wait record only while it is still the thing we are waiting on;
    // a tick that blocked on nothing clears it.
    return { decisions, state: held && blocked ? { blockedId: blocked.id, blockedSince: blocked.since } : {} };
}
