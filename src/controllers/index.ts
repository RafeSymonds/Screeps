import { commandCombatCreep } from "combat/Combat";
import { commandExpansionCreep } from "expansion/Expansion";
import { World } from "world/World";

/**
 * Tactical phase for controller-commanded creeps (the hybrid model). Any creep
 * carrying a `controller` tag is driven imperatively by its owning subsystem
 * here, bypassing job matching.
 */
export function commandControllerCreeps(world: World): void {
    for (const creep of world.creeps) {
        const owner = creep.memory.controller;
        if (!owner || creep.spawning) {
            continue;
        }
        if (owner.startsWith("combat")) {
            commandCombatCreep(creep, world);
        } else if (owner.startsWith("expansion")) {
            commandExpansionCreep(creep, world);
        }
    }
}
