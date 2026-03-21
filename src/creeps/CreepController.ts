import { CreepState } from "./CreepState";
import { EnergyTarget } from "rooms/RoomEnergyState";
import { TaskManager } from "tasks/core/TaskManager";
import { TaskKind } from "tasks/core/TaskKind";
import { getDefaultCreepMemory } from "./CreepMemory";
import { AnyTask } from "tasks/definitions/Task";
import { nextRoomWaypoint } from "rooms/InterRoomRouter";
import { cachedMoveTo } from "pathing/CachedMoveTo";

export function updateCreepMemoryForTask(creepState: CreepState, task: AnyTask) {
    creepState.memory.taskId = task.id();
    creepState.memory.taskTicks = 0;
    creepState.memory.lastTaskKind = task.type();
    creepState.memory.lastTaskRoom = task.data.targetRoom;
    creepState.memory.energyTargetId = undefined;
    creepState.memory.working = true;
}

export function assignCreepEnegyPickup(creep: CreepState, energyTarget: EnergyTarget) {
    creep.memory.energyTargetId = energyTarget.id;
}

export function removeCreepTask(creepState: CreepState, taskManager: TaskManager) {
    const taskId = creepState.memory.taskId;

    if (taskId) {
        const task = taskManager.get(taskId);

        if (task) {
            task.removeCreep(creepState);
        }
    }

    creepState.memory = getDefaultCreepMemory(creepState.memory.ownerRoom, creepState.memory);
}

export function tryOrMove<T extends RoomObject>(
    creep: Creep,
    target: T,
    action: (creep: Creep, target: T) => ScreepsReturnCode
): boolean {
    const result = action(creep, target);

    if (result === ERR_NOT_IN_RANGE) {
        creep.moveTo(target);
        return true; // we moved
    }

    return false; // no move
}

export function creepStoreFull(creep: Creep): boolean {
    const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);

    return freeCapacity === 0;
}

export function creepStoreFullPercentage(creep: Creep) {
    const usedCapacity = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const totalCapacity = creep.store.getCapacity(RESOURCE_ENERGY);

    return usedCapacity / totalCapacity;
}

export function creepNeedsEnergy(creepState: CreepState, world?: import("world/World").World) {
    const usedCapacity = creepState.creep.store.getUsedCapacity(RESOURCE_ENERGY);
    const freeCapacity = creepState.creep.store.getFreeCapacity(RESOURCE_ENERGY);

    // If we're already carrying some energy, don't flip back to "needs energy" mode
    // until we are completely empty. This prevents "ping-pong" behavior near the spawn.
    if (usedCapacity > 0) {
        if (creepState.memory.working) {
            return false; // Stay in working mode until empty
        }

        // If we have some energy but were in collection mode, check if we should switch early.
        // This happens if the room is dry and we've managed to grab at least something.
        if (world) {
            const roomHasEnergy = world.resourceManager.roomHasEnoughEnergy(creepState, creepState.creep.room.name);
            if (!roomHasEnergy && usedCapacity >= 25) {
                creepState.memory.working = true;
                return false;
            }
        }
    }

    if (creepState.memory.working && usedCapacity === 0) {
        creepState.memory.working = false;
    } else if (!creepState.memory.working && freeCapacity === 0) {
        creepState.memory.working = true;
    }

    return !creepState.memory.working;
}

export function tryPreemptCreep(_creepState: CreepState, _taskManager: TaskManager) {
    // Preemption disabled — tasks self-manage their energy cycles via
    // creepNeedsEnergy + findBestEnergyTask in nextAction.
    // The old preemption logic ripped creeps from deliver/upgrade/build tasks
    // after every energy expenditure, then they couldn't get reassigned because
    // roomHasEnoughEnergy returned false in early game.
}

export function moveTo(creepState: CreepState, target: RoomPosition | { pos: RoomPosition }) {
    const destination = "pos" in target ? target.pos : target;
    
    if (creepState.creep.room.name !== destination.roomName) {
        const waypoint = nextRoomWaypoint(creepState.creep.room.name, destination);
        
        // If waypoint is in another room, use direct moveTo to cross the boundary
        if (waypoint.roomName !== creepState.creep.room.name) {
            creepState.creep.moveTo(waypoint, { reusePath: 10 });
            creepState.moved = true;
            return;
        }
        
        cachedMoveTo(creepState, waypoint);
    } else {
        cachedMoveTo(creepState, destination);
    }
}
