/**
 * The one-Action-per-creep-per-tick vocabulary. Internal to creep execution.
 * See docs/design/creeps.md.
 */
import { Pos } from "shared/views";

export enum ActionKind {
    Harvest = "harvest",
    Pickup = "pickup",
    Transfer = "transfer",
    Drop = "drop",
    Upgrade = "upgrade",
    MoveTo = "moveTo",
    Idle = "idle"
}

export type Action =
    | { kind: ActionKind.Harvest; targetId: Id<Source> }
    | { kind: ActionKind.Pickup; targetId: Id<Resource> }
    | { kind: ActionKind.Transfer; targetId: Id<AnyStructure>; resource: ResourceConstant }
    | { kind: ActionKind.Drop; resource: ResourceConstant }
    | { kind: ActionKind.Upgrade; targetId: Id<StructureController> }
    | { kind: ActionKind.MoveTo; pos: Pos; range: number }
    | { kind: ActionKind.Idle; reason: string };

export function chebyshev(a: Pos, b: Pos): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
