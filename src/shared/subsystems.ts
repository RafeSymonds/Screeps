/**
 * Subsystem identities and CPU classes — the vocabulary of the scheduler,
 * telemetry, and the shell's entry list. See docs/design/scheduler.md.
 */

export enum SubsystemId {
    /** Pseudo-entry: shell meters its own bootstrap steps under this id. */
    Shell = "shell",
    /** Pseudo-entry: shell meters snapshot construction under this id. */
    Snapshot = "snapshot",
    TelemetryFlush = "telemetryFlush"
}

export enum CpuClass {
    A = "A",
    B = "B",
    C = "C"
}
