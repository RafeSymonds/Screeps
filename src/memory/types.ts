// Standalone types that don't need global augmentation
export type SpawnRequestRole =
    | "scout"
    | "miner"
    | "mineralHarvester"
    | "hauler"
    | "worker"
    | "defender"
    | "attacker"
    | "reserver";
export type RemoteRoomState = "scouting" | "candidate" | "active" | "saturated" | "unsafe" | "paused" | "reserved";
export type RoomGrowthStage = "bootstrap" | "stabilizing" | "remote" | "surplus";
export type RoomSupportKind = "bootstrap" | "economy" | "build" | "defense";
export type RoomOnboardingStage = "settling" | "bootstrapping" | "established";

export interface RoomSpawnRequest {
    role: SpawnRequestRole;
    priority: number;
    desiredCreeps: number;
    expiresAt: number;
    requestedBy: string;
    minEnergy?: number;
}

export interface SpawnRoleSnapshot {
    supplyParts: number;
    supplyCreeps: number;
    demandParts: number;
    demandCreeps: number;
    idleCreeps: number;
    pressure: number;
}

export interface RoomSpawnStats {
    lastUpdated: number;
    mine: SpawnRoleSnapshot;
    carry: SpawnRoleSnapshot;
    work: SpawnRoleSnapshot;
    scout: SpawnRoleSnapshot;
    combat: SpawnRoleSnapshot;
    attack: SpawnRoleSnapshot;
}

export interface RoomDefenseState {
    hostileCount: number;
    threat: number;
    lastHostileTick: number;
    requestedDefenders: number;
    safeAnchor?: {
        x: number;
        y: number;
        roomName: string;
    };
}

export interface RemoteMiningData {
    lastHarvestTick: number;
    sources: [Id<Source>, RoomPosition][];
    ownerRoom?: string;
}

export interface RemoteRoomStrategy {
    state: RemoteRoomState;
    ownerRoom?: string;
    routeLength?: number;
    score: number;
    sourceCount: number;
    lastEvaluated: number;
    reason?: string;
}

export interface RoomGrowthState {
    stage: RoomGrowthStage;
    desiredRemoteCount: number;
    expansionScore: number;
    nextClaimTarget?: string;
    nextScoutTarget?: string;
    expansionReady: boolean;
    lastEvaluated: number;
}

export interface RoomSupportRequest {
    kind: RoomSupportKind;
    priority: number;
    maxHelpers: number;
    expiresAt: number;
    requestedBy: string;
}

export interface RoomOnboardingState {
    stage: RoomOnboardingStage;
    needsMiner: boolean;
    needsHauler: boolean;
    needsBuilder: boolean;
    lastEvaluated: number;
}
