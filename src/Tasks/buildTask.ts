import * as position from "../positionCalculations";
import { strict } from "assert";
import { drop, forEach, take, words } from "lodash";
import { worker } from "cluster";
import { createPrivateKey } from "crypto";
import { Position } from "source-map";
import internal from "stream";
import { setFlagsFromString } from "v8";
import * as GeneralTask from "Tasks/generalTask";

export class BuildTask extends GeneralTask.Task
{
    id: Id<ConstructionSite>;
    valueLeft: number;
    constructor(constructionSiteID: Id<ConstructionSite>, priority: number)
    {
        let constructionSite: ConstructionSite | null = Game.getObjectById(constructionSiteID)

        super(GeneralTask.TaskType.work, GeneralTask.WorkType.build, priority, constructionSite!.pos);

        this.id = constructionSiteID;
        this.valueLeft = constructionSite!.progressTotal - constructionSite!.progress;
    }

    public processCreepAction(creep: Creep)
    {
        let constructionSite: ConstructionSite | null = Game.getObjectById(this.id);

        if (!constructionSite)
        {
            this.deleteTask();
            return;
        }

        if (creep && creep.store[RESOURCE_ENERGY] > 0)
        {
            if (creep.build(constructionSite) === ERR_NOT_IN_RANGE)
            {
                creep.moveTo(constructionSite!.pos);
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
        this.valueLeft -= creep.store[RESOURCE_ENERGY];
    }
    public unassignCreep(creepName: string)
    {
        super.unassignCreep(creepName);

        let creep: Creep = Game.creeps[creepName];
        this.valueLeft += creep.store[RESOURCE_ENERGY];
    }
    public updateValueLeft(): void
    {
        let constructionSite: ConstructionSite | null = Game.getObjectById(this.id);
        if (constructionSite)
        {
            this.valueLeft = constructionSite.progressTotal - constructionSite.progress;
        }
        this.creeps.forEach(creepName =>
        {
            let creep: Creep = Game.creeps[creepName];

            this.valueLeft -= creep.store.getUsedCapacity();
        });
    }
    public checkCreepMatches(creep: Creep): GeneralTask.CreepMatchesTask
    {
        if (creep.memory.role !== GeneralTask.TaskType.work)
        {
            return GeneralTask.CreepMatchesTask.false;
        }

        if (creep.store.getUsedCapacity() >= creep.store.getCapacity() / 2 || creep.store.getUsedCapacity() > this.valueLeft)
        {
            return GeneralTask.CreepMatchesTask.true;
        }

        return GeneralTask.CreepMatchesTask.needResources;
    }
}
