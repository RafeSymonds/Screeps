export function getDefaultCreepMemory(roomName: string, existing?: Partial<CreepMemory>): CreepMemory {
    return {
        taskId: undefined,
        taskTicks: 0,
        lastTaskKind: existing?.lastTaskKind,
        lastTaskRoom: existing?.lastTaskRoom,
        energyTargetId: undefined,
        working: false,
        ownerRoom: roomName,
        // spawnRole is a stable identity tag (which body template this creep is), not task state —
        // it must survive task resets so SpawnManager keeps counting the creep against the right role.
        spawnRole: existing?.spawnRole
    };
}

export function getCreepMemory(creepName: string): CreepMemory | null {
    return Memory.creeps[creepName];
}
