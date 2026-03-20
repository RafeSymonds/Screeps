const STAGE_AFFINITY_MULTIPLIER: Record<RoomGrowthStage, number> = {
    bootstrap: 0.35,
    stabilizing: 0.65,
    remote: 1,
    surplus: 1.35
};

export function roleAffinityMultiplier(ownerRoomName: string | undefined): number {
    if (!ownerRoomName) {
        return 1;
    }

    const stage = Memory.rooms[ownerRoomName]?.growth?.stage;
    if (!stage) {
        return 1;
    }

    return STAGE_AFFINITY_MULTIPLIER[stage] ?? 1;
}

export function scaledRoleBias(ownerRoomName: string | undefined, baseBias: number): number {
    return Math.round(baseBias * roleAffinityMultiplier(ownerRoomName));
}
