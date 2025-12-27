import { RoomTasksMap } from "tasks/Task";
import { WorldRoom } from "./WorldRoom";

export class World {
    rooms: Map<string, WorldRoom>;

    constructor(rooms: Room[], myCreeps: Creep[], roomTasks: RoomTasksMap) {
        const worldRooms = rooms.map(room => new WorldRoom(room, myCreeps, roomTasks.get(room.name) || new Map()));

        this.rooms = new Map<string, WorldRoom>(worldRooms.map(worldRoom => [worldRoom.room.name, worldRoom]));
    }
}
