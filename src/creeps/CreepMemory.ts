export function getDefaultCreepMemory(): CreepMemory {
    return { taskId: undefined, taskTicks: 0, energyTargetId: undefined, working: false };
}

export function getCreepMemory(creepName: string): CreepMemory | null {
    return Memory.creeps[creepName];
}
