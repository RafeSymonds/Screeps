import { estimateSafeRouteLength } from "./InterRoomRouter";
import { intelStatus, IntelStatus } from "./RoomIntel";
import { ownedRooms } from "./RoomUtils";

type Candidate = {
    remoteRoom: string;
    ownerRoom: string;
    routeLength: number;
    score: number;
    sourceCount: number;
};

function sourceCount(roomMemory: RoomMemory): number {
    return roomMemory.remoteMining?.sources.length ?? 0;
}

function ownerCapacityScore(room: Room): number {
    const growth = room.memory.growth;
    const stageBonus = growth?.stage === "surplus" ? 30 : growth?.stage === "remote" ? 15 : 0;
    const pressurePenalty = ((room.memory.spawnStats?.mine.pressure ?? 0) + (room.memory.spawnStats?.carry.pressure ?? 0)) * 20;

    return room.energyCapacityAvailable / 40 + stageBonus - pressurePenalty;
}

function remoteCandidateScore(ownerRoom: Room, remoteRoom: string, routeLength: number, sources: number): number {
    const roomMemory = Memory.rooms[remoteRoom];
    const previousOwner = roomMemory?.remoteMining?.ownerRoom;
    const hysteresis = previousOwner === ownerRoom.name ? 25 : 0;

    return sources * 120 - routeLength * 30 + ownerCapacityScore(ownerRoom) + hysteresis;
}

function markRemote(roomName: string, strategy: RemoteRoomStrategy) {
    const roomMemory = Memory.rooms[roomName];

    if (!roomMemory) {
        return;
    }

    roomMemory.remoteStrategy = strategy;

    if (roomMemory.remoteMining) {
        roomMemory.remoteMining.ownerRoom = strategy.state === "active" ? strategy.ownerRoom : undefined;
    }
}

export function remoteAssignmentForRoom(roomName: string): RemoteRoomStrategy | undefined {
    return Memory.rooms[roomName]?.remoteStrategy;
}

export function refreshRemoteStrategies(): void {
    const owners = ownedRooms();
    const candidatesByOwner = new Map<string, Candidate[]>();

    for (const owner of owners) {
        candidatesByOwner.set(owner.name, []);
    }

    for (const [roomName, roomMemory] of Object.entries(Memory.rooms)) {
        const sources = sourceCount(roomMemory);

        if (!roomMemory.remoteMining || sources === 0) {
            continue;
        }

        if (Game.rooms[roomName]?.controller?.my) {
            markRemote(roomName, {
                state: "paused",
                score: -Infinity,
                sourceCount: sources,
                lastEvaluated: Game.time,
                reason: "owned room"
            });
            continue;
        }

        if (!roomMemory.intel || Game.time - roomMemory.intel.lastScouted > 5000) {
            markRemote(roomName, {
                state: "scouting",
                score: 0,
                sourceCount: sources,
                lastEvaluated: Game.time,
                reason: "intel stale"
            });
            continue;
        }

        if (intelStatus(roomMemory.intel) !== IntelStatus.OPEN) {
            markRemote(roomName, {
                state: "unsafe",
                score: -1000,
                sourceCount: sources,
                lastEvaluated: Game.time,
                reason: "dangerous room"
            });
            continue;
        }

        let bestCandidate: Candidate | null = null;

        for (const owner of owners) {
            const routeLength = estimateSafeRouteLength(owner.name, roomName);

            if (routeLength === null || routeLength > Math.max(1, owner.memory.remoteRadius)) {
                continue;
            }

            const score = remoteCandidateScore(owner, roomName, routeLength, sources);
            const candidate: Candidate = {
                remoteRoom: roomName,
                ownerRoom: owner.name,
                routeLength,
                score,
                sourceCount: sources
            };

            if (!bestCandidate || candidate.score > bestCandidate.score) {
                bestCandidate = candidate;
            }
        }

        if (!bestCandidate) {
            markRemote(roomName, {
                state: "paused",
                score: -100,
                sourceCount: sources,
                lastEvaluated: Game.time,
                reason: "no safe owner"
            });
        } else {
            candidatesByOwner.get(bestCandidate.ownerRoom)?.push(bestCandidate);
            markRemote(roomName, {
                state: "candidate",
                ownerRoom: bestCandidate.ownerRoom,
                routeLength: bestCandidate.routeLength,
                score: bestCandidate.score,
                sourceCount: sources,
                lastEvaluated: Game.time,
                reason: "candidate"
            });
        }
    }

    const activeRemotes = new Set<string>();

    for (const owner of owners) {
        const desiredCount = owner.memory.growth?.desiredRemoteCount ?? Math.max(0, owner.memory.remoteRadius - 1);
        const candidates = candidatesByOwner.get(owner.name) ?? [];

        candidates.sort((a, b) => b.score - a.score);

        for (const [index, candidate] of candidates.entries()) {
            if (activeRemotes.has(candidate.remoteRoom)) {
                continue;
            }

            if (index < desiredCount) {
                activeRemotes.add(candidate.remoteRoom);
                markRemote(candidate.remoteRoom, {
                    state: "active",
                    ownerRoom: candidate.ownerRoom,
                    routeLength: candidate.routeLength,
                    score: candidate.score,
                    sourceCount: candidate.sourceCount,
                    lastEvaluated: Game.time,
                    reason: "selected"
                });
            }
        }
    }

    for (const [roomName, roomMemory] of Object.entries(Memory.rooms)) {
        const strategy = roomMemory.remoteStrategy;

        if (!strategy || strategy.state !== "candidate") {
            continue;
        }

        markRemote(roomName, {
            ...strategy,
            state: "saturated",
            lastEvaluated: Game.time,
            reason: "owner capacity reached"
        });
    }
}
