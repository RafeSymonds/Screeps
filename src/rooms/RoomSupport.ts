import { estimateSafeRouteLength } from "./InterRoomRouter";

function creepsForOwnerRoom(roomName: string): Creep[] {
    return Object.values(Game.creeps).filter(creep => creep.memory.ownerRoom === roomName);
}

export function updateRoomSupportState(room: Room): RoomSupportRequest | undefined {
    if (!room.controller?.my) {
        room.memory.supportRequest = undefined;
        room.memory.onboarding = undefined;
        return undefined;
    }

    const creeps = creepsForOwnerRoom(room.name);
    const miners = creeps.filter(creep => creep.body.some(part => part.type === WORK) && !creep.body.some(part => part.type === CARRY));
    const haulers = creeps.filter(creep => creep.body.some(part => part.type === CARRY) && !creep.body.some(part => part.type === WORK));
    const workers = creeps.filter(creep => creep.body.some(part => part.type === WORK) && creep.body.some(part => part.type === CARRY));
    const spawnCount = room.find(FIND_MY_SPAWNS).length;
    const constructionSites = room.find(FIND_CONSTRUCTION_SITES).length;
    const hostiles = room.find(FIND_HOSTILE_CREEPS).length;

    let stage: RoomOnboardingStage = "established";

    if (spawnCount === 0 || room.controller.level <= 2) {
        stage = "settling";
    } else if (room.energyCapacityAvailable < 800 || miners.length === 0 || haulers.length === 0) {
        stage = "bootstrapping";
    }

    room.memory.onboarding = {
        stage,
        needsMiner: miners.length === 0,
        needsHauler: haulers.length === 0,
        needsBuilder: constructionSites > 0 && workers.length < 2,
        lastEvaluated: Game.time
    };

    let request: RoomSupportRequest | undefined;

    if (hostiles > 0) {
        request = {
            kind: "defense",
            priority: 150,
            maxHelpers: 3,
            expiresAt: Game.time + 10,
            requestedBy: room.name
        };
    } else if (stage === "settling") {
        request = {
            kind: "bootstrap",
            priority: 100,
            maxHelpers: 4,
            expiresAt: Game.time + 50,
            requestedBy: room.name
        };
    } else if (stage === "bootstrapping") {
        request = {
            kind: miners.length === 0 || haulers.length === 0 ? "economy" : "build",
            priority: 70,
            maxHelpers: 3,
            expiresAt: Game.time + 50,
            requestedBy: room.name
        };
    } else if (constructionSites > 5) {
        request = {
            kind: "build",
            priority: 40,
            maxHelpers: 2,
            expiresAt: Game.time + 25,
            requestedBy: room.name
        };
    }

    room.memory.supportRequest = request;
    return request;
}

export function activeSupportRequest(roomName: string): RoomSupportRequest | undefined {
    const request = Memory.rooms[roomName]?.supportRequest;

    if (!request || request.expiresAt < Game.time) {
        return undefined;
    }

    return request;
}

export function roomCanHelp(helperRoom: Room, targetRoom: string): boolean {
    if (!helperRoom.controller?.my || helperRoom.name === targetRoom) {
        return false;
    }

    const distance = estimateSafeRouteLength(helperRoom.name, targetRoom);

    if (distance === null) {
        return false;
    }

    const growthStage = helperRoom.memory.growth?.stage;

    if (growthStage !== "remote" && growthStage !== "surplus") {
        return false;
    }

    // For bootstrap requests, allow much larger range (up to 8 rooms)
    const targetSupport = activeSupportRequest(targetRoom);
    if (targetSupport?.kind === "bootstrap") {
        return distance <= 8;
    }

    // For other support, use assistRadius + 2
    return distance <= helperRoom.memory.assistRadius + 2;
}
