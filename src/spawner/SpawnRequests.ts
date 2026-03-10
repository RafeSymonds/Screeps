export function getActiveSpawnRequests(room: Room): RoomSpawnRequest[] {
    const requests = room.memory.spawnRequests ?? [];
    const active = requests.filter(request => request.expiresAt >= Game.time && request.desiredCreeps > 0);

    room.memory.spawnRequests = active;
    return active;
}

export function upsertSpawnRequest(room: Room, request: RoomSpawnRequest): void {
    const requests = getActiveSpawnRequests(room);
    const index = requests.findIndex(
        existing => existing.role === request.role && existing.requestedBy === request.requestedBy
    );

    if (index >= 0) {
        requests[index] = request;
    } else {
        requests.push(request);
    }

    room.memory.spawnRequests = requests;
}

export function clearSpawnRequest(room: Room, role: SpawnRequestRole, requestedBy: string): void {
    room.memory.spawnRequests = getActiveSpawnRequests(room).filter(
        request => !(request.role === role && request.requestedBy === requestedBy)
    );
}
