/**
 * Creep assignments — the cross-subsystem contract between planners (who write
 * them into CreepMemory at spawn) and creep execution (who performs them).
 * See docs/design/economy.md.
 *
 * An assignment says WHAT a creep is for, never what it should do right now. That
 * line is deliberate and it is why these types are so small: the moment-to-moment
 * decision is re-derived from the world every tick by the executors, so an
 * assignment cannot go stale. A `BuildAssignment` naming a specific site would be
 * wrong the tick that site completes; naming only the room never is.
 *
 * The persisted fields are exactly the ones that cannot be re-derived — which
 * source this miner serves, which room this hauler delivers to. Everything else
 * is recomputed.
 */

/**
 * There are exactly three economy roles — **miner, hauler, worker** — plus the
 * few genuinely non-economy specialists (defend/scout/reserve/claim, which need
 * bodies no economy creep has).
 *
 * `Work` deliberately covers building, upgrading AND self-supply by harvesting.
 * Splitting them was a mistake: it forced the planner to guess a build/upgrade
 * headcount split ahead of time, and that guess was wrong the moment the
 * construction queue emptied or filled — leaving upgraders idle beside open sites
 * or builders with nothing to build. A worker just looks at the room and does the
 * most valuable thing available, so the split is continuous and free.
 */
export enum AssignmentKind {
    Mine = "mine",
    Haul = "haul",
    Work = "work",
    Defend = "defend",
    Scout = "scout",
    Reserve = "reserve",
    Claim = "claim"
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

/** Expansion (M6): take the target room's controller. */
export interface ClaimAssignment {
    kind: AssignmentKind.Claim;
    room: string;
}

/**
 * Roomwide — every target (which site, which pile, whether to harvest for itself)
 * is derived from the snapshot each tick. A persisted target would go stale the
 * moment a site completes or a pile is taken.
 */
export interface WorkAssignment {
    kind: AssignmentKind.Work;
    room: string;
}

export type Assignment =
    | MineAssignment
    | HaulAssignment
    | WorkAssignment
    | DefendAssignment
    | ScoutAssignment
    | ReserveAssignment
    | ClaimAssignment;
