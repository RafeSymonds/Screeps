import * as position from "../positionCalculations";
import { strict } from "assert";
import { drop, forEach, take, words } from "lodash";
import { worker } from "cluster";
import { createPrivateKey } from "crypto";
import { Position } from "source-map";
import internal from "stream";
import { setFlagsFromString } from "v8";
import * as GeneralTask from "Tasks/generalTask";
import { resolveSoa } from "dns";

export class CollectDroppedResource extends GeneralTask.Task
{
    id: Id<Resource>;
    valueLeft: number;
    constructor(resourceID: Id<Resource>)
    {
        let resource: Resource | null = Game.getObjectById(resourceID);

        super(GeneralTask.TaskType.collect, GeneralTask.WorkType.collectResource, 3, resource!.pos);
        this.id = resourceID;

        this.valueLeft = resource!.amount;
    }

    public processCreepAction(creep: Creep)
    {
        let resource: Resource | null = Game.getObjectById(this.id);

        if (!resource)
        {
            this.deleteTask();
            return;
        }

        if (creep.store.getFreeCapacity() > 0)
        {
            if (creep.pickup(resource) === ERR_NOT_IN_RANGE)
            {
                creep.moveTo(resource);
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

        let creep: Creep = Game.creeps[creepName];
        this.valueLeft = Math.max(this.valueLeft - creep.store.getFreeCapacity(), 0);
    }
    public unassignCreep(creepName: string)
    {
        super.unassignCreep(creepName);

        let creep: Creep = Game.creeps[creepName];
        this.valueLeft -= creep.store.getFreeCapacity();
    }
    public updateValueLeft(): void
    {
        let resource: Resource | null = Game.getObjectById(this.id);
        if (resource)
        {
            this.valueLeft = resource.amount;
        }
        this.creeps.forEach(creepName =>
        {
            let creep: Creep = Game.creeps[creepName];
            this.valueLeft -= creep.store.getFreeCapacity();
        });
    }
    public checkCreepMatches(creep: Creep): GeneralTask.CreepMatchesTask
    {
        if (creep.store.getCapacity() > 0 && creep.store[RESOURCE_ENERGY] < creep.store.getCapacity() / 2)
        {
            return GeneralTask.CreepMatchesTask.true;
        }
        return GeneralTask.CreepMatchesTask.false;
    }
}
