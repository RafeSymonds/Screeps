import { estimateSafeRouteLength } from "./InterRoomRouter";
import { ownedRooms } from "./RoomUtils";
import { getMyUsername } from "utils/GameUtils";

const MIN_EXPANSION_DISTANCE = 3;
const MAX_EXPANSION_DISTANCE = 6;
const MIN_SOURCES_FOR_EXPANSION = 2;
const MIN_BUCKET_FOR_EXPANSION = 5000;
const CPU_HEADROOM_PER_ROOM = 10;

function roomExpansionCandidateScore(ownerRoom: Room, targetRoomName: string, ownedNames: Set<string>): number {
    const targetMemory = Memory.rooms[targetRoomName];

    if (!targetMemory?.remoteMining) return -Infinity;

    // Skip owned or reserved rooms
    if (targetMemory.intel?.owner) return -Infinity;
    if (targetMemory.intel?.reservedBy && targetMemory.intel.reservedBy !== getMyUsername()) return -Infinity;

    // Skip dangerous rooms
    if (targetMemory.intel?.keeperLairs && targetMemory.intel.keeperLairs > 0) return -Infinity;
    if (targetMemory.intel?.hasEnemyBase) return -Infinity;

    // Need fresh intel
    if (!targetMemory.intel || Game.time - targetMemory.intel.lastScouted > 5000) return -Infinity;

    const sourceCount = targetMemory.remoteMining.sources.length;

    // Require at least 2 sources for a new base
    if (sourceCount < MIN_SOURCES_FOR_EXPANSION) return -Infinity;

    const routeLength = estimateSafeRouteLength(ownerRoom.name, targetRoomName);
    if (routeLength === null) return -Infinity;

    // Enforce minimum distance — rooms too close should be remotes, not bases
    if (routeLength < MIN_EXPANSION_DISTANCE) return -Infinity;

    // Don't expand too far
    if (routeLength > MAX_EXPANSION_DISTANCE) return -Infinity;

    // Check distance from ALL owned rooms — avoid clustering
    for (const ownedName of ownedNames) {
        if (ownedName === ownerRoom.name) continue;
        const dist = estimateSafeRouteLength(ownedName, targetRoomName);
        if (dist !== null && dist < MIN_EXPANSION_DISTANCE) return -Infinity;
    }

    // Count how many neighboring rooms could become remotes for this base
    let potentialRemotes = 0;
    for (const [roomName, roomMemory] of Object.entries(Memory.rooms)) {
        if (roomName === targetRoomName) continue;
        if (ownedNames.has(roomName)) continue;
        if (!roomMemory.remoteMining || roomMemory.remoteMining.sources.length === 0) continue;
        if (roomMemory.intel?.owner || roomMemory.intel?.hasEnemyBase || roomMemory.intel?.keeperLairs) continue;

        const remoteDist = estimateSafeRouteLength(targetRoomName, roomName);
        if (remoteDist !== null && remoteDist <= 2) {
            potentialRemotes++;
        }
    }

    // Score: reward sources, nearby remotes, penalize distance
    const score = sourceCount * 120 + potentialRemotes * 40 - routeLength * 35;

    return score;
}

function nextClaimTarget(room: Room, ownedNames: Set<string>): string | undefined {
    let bestRoom: string | undefined;
    let bestScore = 0; // must be positive to qualify

    for (const roomName in Memory.rooms) {
        if (roomName === room.name) continue;
        if (ownedNames.has(roomName)) continue;

        const score = roomExpansionCandidateScore(room, roomName, ownedNames);

        if (score > bestScore) {
            bestScore = score;
            bestRoom = roomName;
        }
    }

    return bestRoom;
}

function hasCpuForExpansion(): boolean {
    // Check bucket
    if (Game.cpu.bucket < MIN_BUCKET_FOR_EXPANSION) return false;

    // Check average CPU headroom
    const cpuAvg = Memory.cpuAvg ?? 0;
    const cpuLimit = Game.cpu.limit;
    const headroom = cpuLimit - cpuAvg;

    return headroom >= CPU_HEADROOM_PER_ROOM;
}

function isEconomyStable(room: Room, pressurePenalty: number): boolean {
    // A room is not stable if it's currently asking for external support
    if (room.memory.supportRequest && room.memory.supportRequest.expiresAt >= Game.time) {
        return false;
    }

    // High pressure means the room is struggling to maintain its own economy
    if (pressurePenalty > 0.5) {
        return false;
    }

    return true;
}

export function updateRoomGrowth(room: Room): RoomGrowthState {
    const rcl = room.controller?.level ?? 0;
    const capacity = room.energyCapacityAvailable;
    const spawnStats = room.memory.spawnStats;
    const pressurePenalty =
        (spawnStats?.mine.pressure ?? 0) + (spawnStats?.carry.pressure ?? 0) + (spawnStats?.work.pressure ?? 0);

    let stage: RoomGrowthStage = "bootstrap";
    let desiredRemoteCount = 0;

    if (rcl >= 5 && capacity >= 1300) {
        stage = "surplus";
        desiredRemoteCount = 3;
    } else if (rcl >= 3 && capacity >= 800) {
        stage = "remote";
        desiredRemoteCount = 2;
    } else if (rcl >= 2 && capacity >= 550) {
        stage = "stabilizing";
        desiredRemoteCount = 1;
    }

    if (pressurePenalty > 1) {
        desiredRemoteCount = Math.max(0, desiredRemoteCount - 1);
    }

    const storageEnergy = room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    
    // Economy Bonus: encourage expansion when we have massive energy reserves
    const economyBonus = storageEnergy > 100000 ? 20 : 0;
    
    const expansionScore = rcl * 20 + capacity / 40 + storageEnergy / 2000 - pressurePenalty * 30 + economyBonus;

    const ownedNames = new Set(ownedRooms().map(r => r.name));

    const expansionReady =
        stage === "surplus" && 
        expansionScore >= 120 && 
        storageEnergy >= 50000 && 
        isEconomyStable(room, pressurePenalty) &&
        hasCpuForExpansion();

    const claimTarget = expansionReady ? nextClaimTarget(room, ownedNames) : undefined;

    room.memory.remoteRadius = Math.max(1, desiredRemoteCount + 1);
    room.memory.assistRadius = stage === "surplus" ? 2 : 1;

    const growth: RoomGrowthState = {
        stage,
        desiredRemoteCount,
        expansionScore,
        nextClaimTarget: claimTarget,
        expansionReady,
        lastEvaluated: Game.time
    };

    room.memory.growth = growth;

    return growth;
}
