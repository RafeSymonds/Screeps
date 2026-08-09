/**
 * Spawn demand — producers (economy; later defense/remotes/expansion) push these
 * into TickContext.spawnDemands each tick; the spawn resolver consumes them.
 * See docs/design/spawn.md.
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
