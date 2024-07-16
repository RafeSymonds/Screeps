import * as position from "../positionCalculations";
import { strict } from "assert";
import { drop, forEach, take, words } from "lodash";
import { worker } from "cluster";
import { createPrivateKey } from "crypto";
import { Position } from "source-map";
import internal from "stream";
import { setFlagsFromString } from "v8";
import * as GeneralTask from "Tasks/generalTask";


export class CollectEnergyTask extends GeneralTask.Task
{
    id: Id<AnyStoreStructure>;
    valueLeft: number;

    constructor(structureID: Id<AnyStoreStructure>)
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(structureID);

        super(GeneralTask.TaskType.collect, GeneralTask.WorkType.collectStructure, 3, structure!.pos);

        this.id = structureID;
        this.valueLeft = structure!.store.getUsedCapacity() as number;
    }
    public getID(): string
    {
        return this.id;
    }

    public processCreepActions()
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(this.id);

        if (!structure || structure.store.getUsedCapacity() == 0)
        {
            this.deleteTask();
            return;
        }

        this.creeps.forEach(creepName =>
        {
            let creep: Creep = Game.creeps[creepName];

            if (creep.store.getFreeCapacity() > 0 && structure)
            {
                let enegyToTransfer = Math.min(creep.store.getFreeCapacity(), structure!.store.getUsedCapacity() as number);

                if (creep.withdraw(structure, RESOURCE_ENERGY, enegyToTransfer) === ERR_NOT_IN_RANGE)
                {
                    creep.moveTo(structure);
                }
            }
            else
            {
                this.unassignCreep(creepName);
            }
        });
    }
    public hasValueLeft(): boolean
    {
        return false;
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
    public updateValueLeft()
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(this.id);
        if (structure)
        {
            this.valueLeft = structure.store.getUsedCapacity() as number;
        }
        this.creeps.forEach(creepName =>
        {
            let creep: Creep = Game.creeps[creepName];
            this.valueLeft -= creep.store.getUsedCapacity();
        });

        this.valueLeft = Math.max(this.valueLeft, 0);

    }
    public checkCreepMatches(creep: Creep): boolean
    {
        return creep.store.getCapacity() > 0 && creep.store[RESOURCE_ENERGY] < creep.store.getCapacity() / 2;
    }
}
