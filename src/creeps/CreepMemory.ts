export function getDefaultCreepMemory(roomName: string): CreepMemory {
    return { taskId: undefined, taskTicks: 0, energyTargetId: undefined, working: false, ownerRoom: roomName };
}

export function getCreepMemory(creepName: string): CreepMemory | null {
    return Memory.creeps[creepName];
}
