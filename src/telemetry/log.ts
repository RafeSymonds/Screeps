/**
 * Leveled logging with lazy message thunks — below the active level the thunk
 * is never evaluated, so hot paths pay nothing. Level lives in
 * Memory.stats.logLevel (survives resets, settable from the game console).
 *
 * Thunks rather than strings is the whole design: `log.debug(id, () => expensive)`
 * costs one closure allocation and a comparison when debug is off, where an eager
 * template string would build the message and any `JSON.stringify` inside it every
 * tick regardless. That is what makes it safe to leave diagnostics in hot paths
 * permanently instead of deleting them once a bug is fixed.
 *
 * Storing the level in Memory means you can raise it live from the game console
 * during an incident — `Memory.stats.logLevel = 0` — without a deploy, and it
 * survives the global resets that an incident tends to produce.
 */
import { SubsystemId } from "shared/subsystems";

export enum LogLevel {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3
}

function activeLevel(): LogLevel {
    return (Memory as { stats?: { logLevel?: LogLevel } }).stats?.logLevel ?? LogLevel.Info;
}

function emit(level: LogLevel, tag: string, scope: SubsystemId, msg: () => string): void {
    try {
        if (activeLevel() <= level) {
            console.log(`[${tag}][${scope}] ${msg()}`);
        }
    } catch (err) {
        console.log(`[telemetry] log failure in scope ${scope}: ${String(err)}`);
    }
}

export const log = {
    debug: (scope: SubsystemId, msg: () => string): void => emit(LogLevel.Debug, "DBG", scope, msg),
    info: (scope: SubsystemId, msg: () => string): void => emit(LogLevel.Info, "INF", scope, msg),
    warn: (scope: SubsystemId, msg: () => string): void => emit(LogLevel.Warn, "WRN", scope, msg),
    error: (scope: SubsystemId, msg: () => string): void => emit(LogLevel.Error, "ERR", scope, msg)
};
