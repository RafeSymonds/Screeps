export const DEFAULT_CREEP_MEMORY: CreepMemory = {
    taskId: undefined,
    taskTicks: 0,
    energyTargetId: undefined
};

export function getCreepMemory(creepName: string): CreepMemory | null {
    return Memory.creeps[creepName];
}
