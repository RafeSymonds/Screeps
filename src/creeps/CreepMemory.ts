export function getDefaultCreepMemory(roomName: string, existing?: Partial<CreepMemory>): CreepMemory {
    return {
        taskId: undefined,
        taskTicks: 0,
        lastTaskKind: existing?.lastTaskKind,
        lastTaskRoom: existing?.lastTaskRoom,
        energyTargetId: undefined,
        working: false,
        ownerRoom: roomName
    };
}

export function getCreepMemory(creepName: string): CreepMemory | null {
    return Memory.creeps[creepName];
}
