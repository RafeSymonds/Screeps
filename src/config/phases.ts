/**
 * Names of the pipeline phases run each tick in `main.ts`. Used both as
 * `guard()` log labels and as `Scheduler` keys into `Memory.planRuns`.
 *
 * Centralized as a string enum so the labels aren't scattered as magic
 * literals: a typo in a scheduler key would otherwise silently create a new
 * `Memory.planRuns` entry instead of failing to compile. String values are
 * kept stable (== the old literals) so existing `planRuns` keys keep working.
 */
export enum Phase {
    Scout = "scout",
    Defense = "defense",
    Jobs = "jobs",
    Base = "base",
    Expansion = "expansion",
    Combat = "combat",
    Reconcile = "reconcile",
    Prune = "prune",
    Economy = "economy",
    Spawn = "spawn",
    Match = "match",
    Towers = "towers",
    Controllers = "controllers",
    /** Prefix for per-creep execution labels, e.g. `run:Worker123`. */
    Run = "run"
}
