import * as position from "../positionCalculations";
import { strict } from "assert";
import { drop, forEach, take, words } from "lodash";
import { worker } from "cluster";
import { createPrivateKey } from "crypto";
import { Position } from "source-map";
import internal from "stream";
import { setFlagsFromString } from "v8";
import * as GeneralTask from "Tasks/generalTask";

export class DropResourceTask extends GeneralTask.Task
{
    static droppedResourceNum = 0;

    id: string;
    constructor(dropLocation: RoomPosition)
    {
        super(GeneralTask.TaskType.transport, GeneralTask.WorkType.none, 100, dropLocation);
        this.id = String(DropResourceTask.droppedResourceNum);

        DropResourceTask.droppedResourceNum++;
    }

    public processCreepAction(creep: Creep)
    {
        if (creep.store.getFreeCapacity() > 0)
        {
            if (creep.pos.isEqualTo(this.position))
            {
                creep.drop(RESOURCE_ENERGY);
                this.unassignCreep(creep.name);
            }
            else
            {
                creep.moveTo(this.position);
            }
        }
        else
        {
            this.unassignCreep(creep.name);
        }
    }
    public getID(): string
    {
        return this.id;
    }
    public taskAssignCreep(creepName: string)
    {
        super.taskAssignCreep(creepName);
    }
    public unassignCreep(creepName: string)
    {
        super.unassignCreep(creepName);
    }
    public updateValueLeft(): void
    {

    }
    public checkCreepMatches(creep: Creep): GeneralTask.CreepMatchesTask
    {
        if (creep.store.getCapacity() > 0 && creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2)
        {
            return GeneralTask.CreepMatchesTask.true;
        }
        return GeneralTask.CreepMatchesTask.false
    }
}
