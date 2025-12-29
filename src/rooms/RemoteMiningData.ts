export function getDefaultRemoteRoomMemory(): RemoteMiningData {
    return { lastHarvestTick: -1 };
}

export function getRemoteRoomMemory(room: string) {
    return Memory.remoteRooms[room] || getDefaultRemoteRoomMemory();
}

export function updateRemoteRoomMemory(room: string, memory: RemoteMiningData) {
    Memory.remoteRooms[room] = memory;
}
