import { SpawnDemand } from "shared/spawning";
import { WorldSnapshot } from "shared/views";

/** What every scheduled entry receives. See docs/design/scheduler.md. */
export interface TickContext {
    snapshot: WorldSnapshot;
    /** Fresh [] each tick (shell-built); producers push, the spawn resolver consumes. */
    spawnDemands: SpawnDemand[];
}
