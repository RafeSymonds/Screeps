export function getDefaultRemoteRoomMemory(): RemoteRoomMemory {
    return { lastHarvestTick: -1 };
}

export function getRemoteRoomMemory(room: string) {
    return Memory.remoteRooms[room] || getDefaultRemoteRoomMemory();
}

export function updateRemoteRoomMemory(room: string, memory: RemoteRoomMemory) {
    Memory.remoteRooms[room] = memory;
}
