import { WorldRoom } from "./WorldRoom";

export class World {
    rooms: Map<string, WorldRoom>;

    constructor(rooms: Room[], myCreeps: Creep[]) {
        const worldRooms = rooms.map(room => new WorldRoom(room, myCreeps));

        this.rooms = new Map<string, WorldRoom>(worldRooms.map(worldRoom => [worldRoom.room.name, worldRoom]));
    }
}
