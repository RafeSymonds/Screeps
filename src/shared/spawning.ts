/**
 * Spawn demand — producers (economy; later defense/remotes/expansion) push these
 * into TickContext.spawnDemands each tick; the spawn resolver consumes them.
 * See docs/design/spawn.md.
 *
 * A demand is a *request*, valid for exactly one tick. Producers re-emit what they
 * still want next tick, so nothing accumulates, nothing needs cancelling, and a
 * producer that changes its mind simply stops asking. This is why every demand
 * producer must be scheduled before Spawn and why they cannot be class-C interval
 * entries: a demand nobody re-emits this tick does not exist this tick.
 *
 * `priority` is the only channel through which producers compete, and it is a
 * single global scale (lower = more urgent) so that a defender, a claimer and a
 * miner can be ranked against each other by a resolver that knows nothing about
 * any of them.
 */
import { Assignment } from "shared/assignments";
import { SubsystemId } from "shared/subsystems";

export interface SpawnDemand {
    /** Stable key for the gap (in-tick serviced-set key; M6 cross-room dedupe key). */
    id: string;
    /** Lower = more urgent; tiers defined in economy.md. */
    priority: number;
    /** Room whose spawns service this. */
    home: string;
    owner: SubsystemId;
    assignment: Assignment;
    /** Ideal body for current energyCapacityAvailable. */
    body: BodyPartConstant[];
    /** Present ⟺ the producer declares this role income-dead; the resolver may fall
     *  back to it when the ideal body is unaffordable. */
    minBody?: BodyPartConstant[];
}
