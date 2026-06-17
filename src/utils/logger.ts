/**
 * Tiny logging helper. Centralized so we can later add throttling, log levels,
 * or per-subsystem tags without touching call sites.
 */

export function log(message: string): void {
    console.log(`[${Game.time}] ${message}`);
}

export function warn(message: string): void {
    console.log(`[${Game.time}] <span style="color:orange">WARN ${message}</span>`);
}

export function error(message: string): void {
    console.log(`[${Game.time}] <span style="color:red">ERROR ${message}</span>`);
}
