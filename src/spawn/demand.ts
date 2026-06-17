import { World } from "world/World";

export interface RoomLabor {
    work: number;
    carry: number;
}

/** Total live WORK/CARRY parts homed in a room — the supply side of demand. */
export function laborSupply(world: World, roomName: string): RoomLabor {
    const labor: RoomLabor = { work: 0, carry: 0 };
    for (const creep of world.creepsForRoom(roomName)) {
        labor.work += creep.getActiveBodyparts(WORK);
        labor.carry += creep.getActiveBodyparts(CARRY);
    }
    return labor;
}
