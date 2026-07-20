import { WorldSnapshot } from "shared/views";

/** What every scheduled entry receives. See docs/design/scheduler.md. */
export interface TickContext {
    snapshot: WorldSnapshot;
}
