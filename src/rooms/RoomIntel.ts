import { Cardinal, NeighborMap } from "./RoomTopology";
import { countKeeperLairs, hasInvaderCore } from "./RoomUtils";

const EXIT_TO_CARDINAL: Record<ExitConstant, Cardinal> = {
    [TOP]: "N",
    [RIGHT]: "E",
    [BOTTOM]: "S",
    [LEFT]: "W"
};

export function recordRoom(room: Room) {
    const mem = room.memory;

    // Topology: once
    if (!mem.topology) {
        mem.topology = recordTopology(room.name);
    }

    if (!mem.remoteMining) {
        const sources = room.find(FIND_SOURCES).map((source): [Id<Source>, RoomPosition] => [source.id, source.pos]);

        mem.remoteMining = { lastHarvestTick: -1, sources: sources, ownerRoom: undefined };
    }

    // Track hostile military presence
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    const hostileMilitaryParts = hostiles.reduce((total, creep) => {
        return total + creep.body.filter(
            p => p.type === ATTACK || p.type === RANGED_ATTACK || p.type === HEAL
        ).length;
    }, 0);

    // Intel: refreshed
    mem.intel = {
        lastScouted: Game.time,
        owner: room.controller?.owner?.username,
        reservedBy: room.controller?.reservation?.username,
        hasEnemyBase: room.controller !== undefined && !room.controller.my,
        hasInvaderCore: hasInvaderCore(room),
        keeperLairs: countKeeperLairs(room),
        lastHostileSeen: hostiles.length > 0 ? Game.time : (mem.intel?.lastHostileSeen ?? 0),
        hostileMilitaryParts
    };
}

function recordTopology(roomName: string): RoomTopology {
    const exits = Game.map.describeExits(roomName);
    const neighbors: NeighborMap = {};

    for (const dir in exits) {
        const cardinal = EXIT_TO_CARDINAL[Number(dir) as ExitConstant];
        neighbors[cardinal] = exits[Number(dir) as ExitConstant]!;
    }

    return { neighbors: neighbors };
}

export enum IntelStatus {
    UNKNOWN,
    OPEN,
    DANGEROUS
}

export function intelStatus(intel?: RoomIntel): IntelStatus {
    if (!intel) {
        return IntelStatus.UNKNOWN;
    }

    if (intel.keeperLairs > 0 || intel.hasEnemyBase || intel.hasInvaderCore) {
        return IntelStatus.DANGEROUS;
    }

    return IntelStatus.OPEN;
}
