import { RoomTasksMap, Task } from "tasks/Task";
import { WorldRoom } from "./WorldRoom";
import { TaskData } from "tasks/TaskData";

export class World {
    rooms: Map<string, WorldRoom>;

    constructor(rooms: Room[], myCreeps: Creep[], roomTasks: RoomTasksMap) {
        const worldRooms = rooms.map(room => new WorldRoom(room, myCreeps, roomTasks.get(room.name) || new Map()));

        this.rooms = new Map<string, WorldRoom>(worldRooms.map(worldRoom => [worldRoom.room.name, worldRoom]));
    }

    public getCreepData(): CreepMemory[] {
        const creeps: CreepMemory[] = [];

        this.rooms.forEach(room => room.myCreepsInRoom.forEach(creep => creeps.push(creep.memory)));

        return creeps;
    }

    public getRoomTaskData(): TaskData[] {
        const tasks: TaskData[] = [];

        this.rooms.forEach(room => room.tasks.forEach(task => tasks.push(task.data)));

        return tasks;
    }
}
