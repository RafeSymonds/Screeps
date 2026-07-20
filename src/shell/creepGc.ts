/**
 * Dead-creep memory GC. Ordering invariant (docs/design/shell.md): this runs
 * before any spawn intents — spawnCreep writes Memory.creeps[name] at tick T
 * but the creep appears in Game.creeps only from T+1, so a GC moved after the
 * scheduler would delete newborn memories.
 */
export function cleanDeadCreepMemory(): void {
    for (const name of Object.keys(Memory.creeps)) {
        if (!(name in Game.creeps)) {
            delete Memory.creeps[name];
        }
    }
}
