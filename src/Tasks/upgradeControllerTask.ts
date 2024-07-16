import * as position from "../positionCalculations";
import { strict } from "assert";
import { drop, forEach, take, words } from "lodash";
import { worker } from "cluster";
import { createPrivateKey } from "crypto";
import { Position } from "source-map";
import internal from "stream";
import { setFlagsFromString } from "v8";
import * as GeneralTask from "Tasks/generalTask";


export class UpgradeControllerTask extends GeneralTask.Task
{
    id: Id<StructureController>;


    constructor(controllerID: Id<StructureController>)
    {
        let controller: StructureController | null = Game.getObjectById(controllerID);

        super(GeneralTask.TaskType.work, GeneralTask.WorkType.upgradeController, 30, controller!.pos);

        this.id = controllerID;
    }
    public getID(): string
    {
        return this.id;
    }

    public processCreepActions()
    {
        let controller: StructureController | null = Game.getObjectById(this.id);

        if (!controller)
        {
            this.deleteTask();
            return;
        }

        this.creeps.forEach(creepName =>
        {
            let creep: Creep = Game.creeps[creepName];
            if (creep && creep.store[RESOURCE_ENERGY] > 0 && controller)
            {
                if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE)
                {
                    creep.moveTo(controller);
                }
            }

            this.unassignCreep(creepName);

        });


    }
    public hasValueLeft(): boolean
    {
        return true;
    }
    public taskAssignCreep(creepName: string)
    {
        super.taskAssignCreep(creepName);
    }
    public unassignCreep(creepName: string)
    {
        super.unassignCreep(creepName);
    }
    public updateValueLeft()
    { }
    public checkCreepMatches(creep: Creep): boolean
    {
        return creep.store.getCapacity() > 0 && creep.memory.role === GeneralTask.TaskType.work && creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2;
    }
}

