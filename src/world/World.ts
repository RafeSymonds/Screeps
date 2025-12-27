import { AnyTask, TaskMap } from "tasks/Task";
import { WorldRoom } from "./WorldRoom";
import { TaskData } from "tasks/TaskData";
import { filterMapToArray, mapMap, mapToArray } from "utils/MapUtils";

export class World {
    tasks: TaskMap;

    rooms: Map<string, WorldRoom>;

    constructor(rooms: Room[], myCreeps: Creep[], tasks: TaskMap) {
        this.tasks = tasks;

        const worldRooms = rooms.map(room => new WorldRoom(room, myCreeps, tasks));

        this.rooms = new Map<string, WorldRoom>(worldRooms.map(worldRoom => [worldRoom.room.name, worldRoom]));
    }

    public getCreepData(): CreepMemory[] {
        const creeps: CreepMemory[] = [];

        this.rooms.forEach(room => room.myCreepsInRoom.forEach(creep => creeps.push(creep.memory)));

        return creeps;
    }

    public getRoomTaskData(): TaskData[] {
        return mapToArray(this.tasks, task => task.data);
    }
}
