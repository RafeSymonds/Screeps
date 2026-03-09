import { estimateSafeRouteLength } from "./InterRoomRouter";

function roomExpansionCandidateScore(ownerRoom: Room, targetRoomName: string): number {
    const targetMemory = Memory.rooms[targetRoomName];

    if (!targetMemory?.remoteMining || targetMemory.intel?.owner || targetMemory.intel?.reservedBy) {
        return -Infinity;
    }

    const routeLength = estimateSafeRouteLength(ownerRoom.name, targetRoomName);

    if (routeLength === null) {
        return -Infinity;
    }

    const sourceCount = targetMemory.remoteMining.sources.length;

    return sourceCount * 120 - routeLength * 35;
}

function nextClaimTarget(room: Room): string | undefined {
    let bestRoom: string | undefined;
    let bestScore = -Infinity;

    for (const roomName in Memory.rooms) {
        if (roomName === room.name) {
            continue;
        }

        const score = roomExpansionCandidateScore(room, roomName);

        if (score > bestScore) {
            bestScore = score;
            bestRoom = roomName;
        }
    }

    return bestScore > 0 ? bestRoom : undefined;
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
    const expansionScore = rcl * 20 + capacity / 40 + storageEnergy / 2000 - pressurePenalty * 30;
    const claimTarget = stage === "surplus" && expansionScore >= 120 ? nextClaimTarget(room) : undefined;

    room.memory.remoteRadius = Math.max(1, desiredRemoteCount + 1);
    room.memory.assistRadius = stage === "surplus" ? 2 : 1;

    const growth: RoomGrowthState = {
        stage,
        desiredRemoteCount,
        expansionScore,
        nextClaimTarget: claimTarget,
        lastEvaluated: Game.time
    };

    room.memory.growth = growth;

    return growth;
}
