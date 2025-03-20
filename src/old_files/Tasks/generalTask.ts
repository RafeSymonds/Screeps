import * as position from "../positionCalculations";
import { strict } from "assert";
import { drop, forEach, take, words } from "lodash";
import { worker } from "cluster";
import { createPrivateKey } from "crypto";
import { Position } from "source-map";
import internal from "stream";
import { setFlagsFromString } from "v8";

export enum TaskType
{
    work,
    transport,
    collect,
    harvest,
    dropResource
}

export enum WorkType
{
    harvest,
    build,
    repair,
    upgradeController,
    collectStructure,
    collectResource,
    none
}

export enum CreepMatchesTask
{
    true,
    needResources,
    false
}

export class Task
{
    type: TaskType;
    workType: WorkType;
    priority: number;
    position: RoomPosition;

    creeps: Set<string> = new Set();

    constructor(type: TaskType, workType: WorkType, priority: number, position: RoomPosition)
    {
        this.type = type;
        this.workType = workType;
        this.priority = priority;
        this.position = position;
    }
    public getID(): string
    {
        return "";
    }
    public getPosition(): RoomPosition
    {
        return this.position;
    }
    public getCreeps(): Set<string>
    {
        return this.creeps;
    }
    public numCreepsAssigned(): number
    {
        return this.creeps.size;
    }
    public tryToRemoveDeadCreeps(creepName: string)
    {
        this.creeps.forEach(creepName =>
        {
            if (!Game.creeps[creepName])
            {
                this.creeps.delete(creepName);
                deleteCreepMemory(creepName);
            }
        });

        this.updateValueLeft();
    }
    public deleteTask()
    {
        delete global.roomMemory[this.position.roomName].tasks[this.getID()];

        this.creeps.forEach(creep =>
        {
            this.unassignCreep(creep);
        });
    }

    public processCreepAction(creep: Creep)
    { }
    public hasValueLeft(): boolean
    {
        return false;
    }
    public taskAssignCreep(creepName: string)
    {
        this.creeps.add(creepName);

        let creep = Game.creeps[creepName];

        creep.memory.taskID.push(this.getID())
    }
    public unassignCreep(creepName: string)
    {
        this.creeps.delete(creepName);
    }
    public updateValueLeft()
    { }
    public checkCreepMatches(creep: Creep): CreepMatchesTask
    {
        return CreepMatchesTask.false;
    }
}


export function deleteCreepMemory(creepName: string)
{
    let creepMemory: CreepMemory = Memory.creeps[creepName];
    let room: Room = Game.rooms[creepMemory.roomName];
    console.log("deleting creep memory in ", room)
    if (room)
    {
        console.log("valid room");
        if (creepMemory.role === TaskType.work)
        {
            global.roomMemory[room.name].workerCreepCount -= 1;
        }
        else if (creepMemory.role === TaskType.transport)
        {
            global.roomMemory[room.name].transporterCreepCount -= 1;
        }
        else if (creepMemory.role === TaskType.harvest)
        {
            global.roomMemory[room.name].harvesterCreepCount -= 1;
        }

        creepMemory.taskID.forEach(taskID =>
        {
            global.roomMemory[room.name].tasks[taskID].tryToRemoveDeadCreeps(creepName);
        });

    }
    delete Memory.creeps[creepName];
}

