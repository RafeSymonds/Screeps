export function getDefaultRoomMemory(): RoomMemory {
    return {
        numHarvestSpots: 0,
        anchorSpawnId: undefined,
        assistRadius: 2,
        remoteRadius: 2,
        defense: undefined,
        spawnRequests: [],
        spawnStats: undefined,
        remoteStrategy: undefined,
        growth: undefined,
        supportRequest: undefined,
        onboarding: undefined
    };
}
