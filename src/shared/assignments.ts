/**
 * Creep assignments — the cross-subsystem contract between planners (who write
 * them into CreepMemory at spawn) and creep execution (who performs them).
 * See docs/design/economy.md.
 */

export enum AssignmentKind {
    Mine = "mine",
    Haul = "haul",
    Upgrade = "upgrade",
    Build = "build",
    Defend = "defend",
    Scout = "scout",
    Reserve = "reserve",
    Claim = "claim",
    Pioneer = "pioneer"
}

export interface MineAssignment {
    kind: AssignmentKind.Mine;
    room: string;
    sourceId: Id<Source>;
}

export interface HaulAssignment {
    kind: AssignmentKind.Haul;
    room: string;
    sourceId: Id<Source>;
    /** Deliver into this room's sinks (remote hauling, M5); defaults to `room`. */
    to?: string;
}

export interface UpgradeAssignment {
    kind: AssignmentKind.Upgrade;
    room: string;
}

/** Roomwide — the focus site is derived from the snapshot each tick (creeps.md);
 *  a persisted site id would go stale the moment a site completes. */
export interface BuildAssignment {
    kind: AssignmentKind.Build;
    room: string;
}

/** Roomwide — the target hostile is derived each tick (defense.md). */
export interface DefendAssignment {
    kind: AssignmentKind.Defend;
    room: string;
}

/** Travel-only roles (M5): the executor works wherever the creep stands. */
export interface ScoutAssignment {
    kind: AssignmentKind.Scout;
    room: string;
}

export interface ReserveAssignment {
    kind: AssignmentKind.Reserve;
    room: string;
}

/** Expansion (M6): claim the target's controller, then bootstrap it by hand
 *  until its own spawn stands. */
export interface ClaimAssignment {
    kind: AssignmentKind.Claim;
    room: string;
}

export interface PioneerAssignment {
    kind: AssignmentKind.Pioneer;
    room: string;
}

export type Assignment =
    | MineAssignment
    | HaulAssignment
    | UpgradeAssignment
    | BuildAssignment
    | DefendAssignment
    | ScoutAssignment
    | ReserveAssignment
    | ClaimAssignment
    | PioneerAssignment;
