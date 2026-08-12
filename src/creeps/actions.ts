/**
 * The one-Action-per-creep-per-tick vocabulary. Internal to creep execution.
 * See docs/design/creeps.md.
 *
 * The engine allows a creep one action of each type per tick, and this models a
 * stricter rule: exactly one, chosen deliberately. That makes a creep's behavior
 * a single value you can assert on in a test, rather than a sequence of side
 * effects you have to spy on.
 *
 * `Idle` carries a reason string rather than being a bare "do nothing", because
 * an idle creep is always a question — the tally of reasons in the dispatcher is
 * the bot's cheapest and most useful diagnostic.
 */
import { Pos } from "shared/views";

export enum ActionKind {
    Harvest = "harvest",
    Pickup = "pickup",
    Withdraw = "withdraw",
    Transfer = "transfer",
    Drop = "drop",
    Upgrade = "upgrade",
    Build = "build",
    Repair = "repair",
    Attack = "attack",
    ReserveController = "reserveController",
    ClaimController = "claimController",
    MoveTo = "moveTo",
    Idle = "idle"
}

export type Action =
    | { kind: ActionKind.Harvest; targetId: Id<Source> }
    | { kind: ActionKind.Pickup; targetId: Id<Resource> }
    | { kind: ActionKind.Withdraw; targetId: Id<AnyStructure>; resource: ResourceConstant }
    | { kind: ActionKind.Transfer; targetId: Id<AnyStructure>; resource: ResourceConstant }
    | { kind: ActionKind.Drop; resource: ResourceConstant }
    | { kind: ActionKind.Upgrade; targetId: Id<StructureController> }
    | { kind: ActionKind.Build; targetId: Id<ConstructionSite> }
    | { kind: ActionKind.Repair; targetId: Id<AnyStructure> }
    | { kind: ActionKind.Attack; targetId: Id<Creep> }
    | { kind: ActionKind.ReserveController; targetId: Id<StructureController> }
    | { kind: ActionKind.ClaimController; targetId: Id<StructureController> }
    | { kind: ActionKind.MoveTo; pos: Pos; range: number }
    | { kind: ActionKind.Idle; reason: string };

export function chebyshev(a: Pos, b: Pos): number {
    return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}
