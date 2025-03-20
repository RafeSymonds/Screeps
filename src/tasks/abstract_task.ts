export enum TaskType {
    work,
    transport,
    collect,
    harvest
}

export enum WorkType {
    harvest,
    build,
    repair,
    upgradeController,
    collectStructure,
    collectResource,
    none
}

export enum CreepMatchesTask {
    true,
    needResources,
    false
}

export class TaskInfo {}

export abstract class Task<T extends TaskInfo> {
    static staticProperty: number = 0;

    taskID: number;

    roomName: string;

    type: TaskType;
    workType: WorkType;
    priority: number;
    position: RoomPosition;

    creeps: Map<Id<Creep>, T> = new Map();

    constructor(roomName: string, type: TaskType, workType: WorkType, priority: number, position: RoomPosition) {
        this.taskID = Task.staticProperty;
        Task.staticProperty += 1;

        this.roomName = roomName;

        this.type = type;
        this.workType = workType;
        this.priority = priority;
        this.position = position;

        global.roomMemory[roomName].tasks[this.taskID] = { task: this };
    }

    public getTaskID(): number {
        return this.taskID;
    }

    public getPosition(): RoomPosition {
        return this.position;
    }

    public numCreepsAssigned(): number {
        return this.creeps.size;
    }

    protected getCreeps(): Map<Id<Creep>, T> {
        return this.creeps;
    }

    protected addCreep(creepID: Id<Creep>, value: T) {
        global.creepAssignedTasks[creepID].tasks.push({ taskID: this.taskID, roomName: this.roomName });
        this.creeps.set(creepID, value);
    }

    protected deleteCreep(creepID: Id<Creep>) {
        this.creeps.delete(creepID);
    }

    public deleteTask() {
        this.creeps.forEach((_, creepID) => {
            this.removeCreep(creepID);
        });

        delete global.roomMemory[this.roomName].tasks[this.taskID];
    }

    public removeCreep(creepID: Id<Creep>): void {
        this.unassignCreep(creepID);
        this.creeps.delete(creepID);
    }

    public abstract assignCreep(creep: Creep): void;

    protected abstract unassignCreep(creepID: Id<Creep>): void;

    public abstract checkCreepMatches(creep: Creep): CreepMatchesTask;

    public abstract processCreepAction(creep: Creep): void;

    public abstract updateValueLeft(): void;

    public abstract hasValueLeft(): boolean;
}

export type TaskClassType = Task<TaskInfo>;
