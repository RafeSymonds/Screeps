import { SpawnDemand } from "shared/spawning";
import { WorldSnapshot } from "shared/views";

/**
 * What every scheduled entry receives — the whole of the per-tick world as far as
 * subsystems are concerned. See docs/design/scheduler.md.
 *
 * Both fields are rebuilt from scratch every tick and nothing here is persisted,
 * which is what makes the tick a clean slate: a subsystem cannot accidentally
 * carry state forward through the context, only through its own Memory slice
 * where the ownership rules apply.
 */
export interface TickContext {
    snapshot: WorldSnapshot;
    /** Fresh [] each tick (shell-built); producers push, the spawn resolver consumes. */
    spawnDemands: SpawnDemand[];
}
