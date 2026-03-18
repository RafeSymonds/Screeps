/**
 * Priority levels for spawn requests as defined in the Spawn Request Contract.
 */
export const SpawnRequestPriority = {
    EMERGENCY: 220, // Critical bootstrap (0 energy), emergency defense
    CRITICAL: 180,  // First miner/hauler in a room, high-pressure recovery
    HIGH: 140,      // Cross-room Support/Bootstrap, high-pressure economy
    NORMAL: 90,     // Expansion (Claim), Reservation, Scouting, typical labor
    LOW: 50,        // Secondary builders, surplus haulers, optimization
    IDLE: 10        // Opportunistic or low-value tasks
} as const;

export function getActiveSpawnRequests(room: Room): RoomSpawnRequest[] {
    const requests = room.memory.spawnRequests ?? [];
    const active = requests.filter(request => request.expiresAt >= Game.time && request.desiredCreeps > 0);

    room.memory.spawnRequests = active;
    return active;
}

/**
 * Upserts a spawn request into the room's memory.
 * Deduplicates by role and requestedBy.
 */
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

/**
 * High-level helper for plans to request spawns.
 * Enforces the naming convention: plan:{planName}:{identifier}
 */
export function planSpawnRequest(
    room: Room,
    planName: string,
    identifier: string,
    role: SpawnRequestRole,
    priority: number,
    desiredCreeps: number,
    expiryTicks: number,
    minEnergy?: number
): void {
    upsertSpawnRequest(room, {
        role,
        priority,
        desiredCreeps,
        expiresAt: Game.time + expiryTicks,
        requestedBy: `plan:${planName}:${identifier}`,
        minEnergy
    });
}

export function clearSpawnRequest(room: Room, role: SpawnRequestRole, requestedBy: string): void {
    room.memory.spawnRequests = getActiveSpawnRequests(room).filter(
        request => !(request.role === role && request.requestedBy === requestedBy)
    );
}
