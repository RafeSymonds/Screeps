/**
 * Creep assignments — the cross-subsystem contract between planners (who write
 * them into CreepMemory at spawn) and creep execution (who performs them).
 * See docs/design/economy.md.
 */

export enum AssignmentKind {
    Mine = "mine",
    Haul = "haul",
    Upgrade = "upgrade",
    Build = "build"
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

export type Assignment = MineAssignment | HaulAssignment | UpgradeAssignment | BuildAssignment;
