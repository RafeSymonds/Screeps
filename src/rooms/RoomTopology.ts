export type Cardinal = "N" | "E" | "S" | "W";
export type NeighborMap = Partial<Record<Cardinal, string>>;

type DirectionNumber = 1 | 3 | 5 | 7;

const DIR_TO_CARDINAL: Record<DirectionNumber, Cardinal> = {
    1: "N",
    3: "E",
    5: "S",
    7: "W"
};

const CARDINALS: readonly Cardinal[] = ["N", "E", "S", "W"];

export function isNeightborEmpty(map: NeighborMap): boolean {
    return CARDINALS.every(dir => map[dir] === undefined);
}

export function buildNeighborMap(roomName: string) {
    const exitInfo = Game.map.describeExits(roomName);

    const neighbors: NeighborMap = {};

    for (const key in exitInfo) {
        const dir = Number(key) as DirectionNumber;
        const room = exitInfo[dir];
        if (!room) continue;

        neighbors[DIR_TO_CARDINAL[dir]] = room;
    }

    return neighbors;
}
