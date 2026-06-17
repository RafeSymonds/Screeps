import { DefenseState } from "defense/types";
import { SpawnRequest } from "spawn/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { warn } from "utils/logger";

/**
 * Strategic defense assessment: flags threats, triggers safe mode as a last
 * resort, and (later) posts defender SpawnRequests. Returns requests so the
 * kernel can feed them into the shared spawn queue.
 */
export function assessDefense(world: World): SpawnRequest[] {
    const requests: SpawnRequest[] = [];
    for (const worldRoom of world.myRooms) {
        const state = defenseMemory(worldRoom.name);
        if (worldRoom.hostiles.length === 0) {
            state.threat = 0;
            continue;
        }
        state.threat = worldRoom.hostiles.length;
        state.lastHostile = Game.time;
        maybeSafeMode(worldRoom, state);
        // Defender creeps via SpawnRequest are a future expansion of this subsystem.
    }
    return requests;
}

function defenseMemory(roomName: string): DefenseState {
    const roomMemory = Memory.rooms[roomName] ?? (Memory.rooms[roomName] = {});
    if (!roomMemory.defense) {
        roomMemory.defense = { threat: 0 };
    }
    return roomMemory.defense;
}

function maybeSafeMode(worldRoom: WorldRoom, state: DefenseState): void {
    const controller = worldRoom.controller;
    if (!controller || !controller.my) {
        return;
    }
    if (controller.safeMode || controller.safeModeCooldown || (controller.safeModeAvailable ?? 0) <= 0) {
        return;
    }

    const dangerous = worldRoom.hostiles.some(
        hostile =>
            hostile.getActiveBodyparts(ATTACK) > 0 ||
            hostile.getActiveBodyparts(RANGED_ATTACK) > 0 ||
            hostile.getActiveBodyparts(WORK) > 0
    );
    const nearSpawn = worldRoom.spawns.some(spawn =>
        worldRoom.hostiles.some(hostile => hostile.pos.getRangeTo(spawn) <= 5)
    );

    // Last resort: an offensive enemy is on top of our spawn and we have no
    // towers to answer.
    if (dangerous && nearSpawn && worldRoom.towers.length === 0) {
        if (controller.activateSafeMode() === OK) {
            state.safeModeTriggered = Game.time;
            warn(`SAFE MODE activated in ${worldRoom.name}`);
        }
    }
}
