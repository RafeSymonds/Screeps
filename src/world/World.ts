import { ResourceManager } from "rooms/ResourceManager";
import { WorldRoom } from "./WorldRoom";
import { TaskData } from "tasks/core/TaskData";
import { TaskManager } from "tasks/core/TaskManager";
import { mapToArray } from "utils/MapUtils";

export class World {
    taskManager: TaskManager;

    rooms: Map<string, WorldRoom>;

    resourceManager: ResourceManager;

    constructor(rooms: Room[], myCreeps: Creep[], taskManager: TaskManager) {
        this.taskManager = taskManager;

        const worldRooms = rooms.map(room => new WorldRoom(room, myCreeps, taskManager));

        this.rooms = new Map<string, WorldRoom>(worldRooms.map(worldRoom => [worldRoom.room.name, worldRoom]));

        this.resourceManager = new ResourceManager(worldRooms);
    }

    public getCreepData(): { [name: string]: CreepMemory } {
        const creeps: { [name: string]: CreepMemory } = {};

        this.rooms.forEach(room =>
            room.myCreeps.forEach(creepState => (creeps[creepState.creep.name] = creepState.memory))
        );

        return creeps;
    }

    public getTaskData(): TaskData[] {
        return mapToArray(this.taskManager.tasks, task => task.data);
    }
}
