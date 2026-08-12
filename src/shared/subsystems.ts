/**
 * Subsystem identities and CPU classes — the vocabulary of the scheduler,
 * telemetry, and the shell's entry list. See docs/design/scheduler.md.
 */

export enum SubsystemId {
    /** Pseudo-entry: shell meters its own bootstrap steps under this id. */
    Shell = "shell",
    /** Pseudo-entry: shell meters snapshot construction under this id. */
    Snapshot = "snapshot",
    Empire = "empire",
    EmpireAid = "empireAid",
    Expansion = "expansion",
    ExpansionSpawn = "expansionSpawn",
    Intel = "intel",
    RemotesPlan = "remotesPlan",
    Remotes = "remotes",
    DefenseTowers = "defenseTowers",
    DefenseResponse = "defenseResponse",
    Layout = "layout",
    Construction = "construction",
    Economy = "economy",
    Spawn = "spawn",
    CreepExecution = "creeps",
    Movement = "movement",
    TelemetryFlush = "telemetryFlush"
}

/**
 * What a subsystem is allowed to cost, and therefore when it gets dropped.
 *
 * - **A** — never skipped. Omitting it loses creeps or rooms: tower fire, creep
 *   execution, movement resolution.
 * - **B** — skipped when this tick is already deep into its budget. Wants to run
 *   every tick (spawn demands live one tick) but survives missing one.
 * - **C** — skipped first, and also runs on an interval rather than every tick.
 *   Planning and bookkeeping, where "a few ticks later" costs nothing.
 */
export enum CpuClass {
    A = "A",
    B = "B",
    C = "C"
}
