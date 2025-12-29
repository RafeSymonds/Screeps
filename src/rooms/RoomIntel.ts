import { Cardinal, NeighborMap } from "./RoomTopology";

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

    // Intel: refreshed
    mem.intel = {
        lastScouted: Game.time,
        owner: room.controller?.owner?.username,
        reservedBy: room.controller?.reservation?.username
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
