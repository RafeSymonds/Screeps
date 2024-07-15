import * as position from "../positionCalculations";
import { strict } from "assert";
import { drop, forEach, take, words } from "lodash";
import { worker } from "cluster";
import { createPrivateKey } from "crypto";
import { Position } from "source-map";
import internal from "stream";
import { setFlagsFromString } from "v8";
import * as GeneralTask from "Tasks/generalTask";


export class TransportTask extends GeneralTask.Task
{
    id: Id<AnyStoreStructure>;

    valueLeft: number;

    constructor(priority: number, structureID: Id<AnyStoreStructure>)
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(structureID);

        super(GeneralTask.TaskType.transport, GeneralTask.WorkType.none, priority, structure!.pos);

        this.id = structureID;
        this.valueLeft = structure!.store.getFreeCapacity() as number;
    }
    public getID(): string
    {
        return this.id;
    }
    public processCreepActions()
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(this.id);

        if (!structure || structure.store.getFreeCapacity() == 0)
        {
            this.deleteTask();
            return;
        }

        this.creeps.forEach(creepName =>
        {
            let creep: Creep = Game.creeps[creepName];

            if (creep.store.getUsedCapacity() > 0)
            {
                let enegyToTransfer = Math.min(creep.store[RESOURCE_ENERGY], structure.store.getFreeCapacity() as number);
                if (creep.transfer(structure, RESOURCE_ENERGY, enegyToTransfer) === ERR_NOT_IN_RANGE)
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
        return this.valueLeft > 0;
    }
    public taskAssignCreep(creepName: string)
    {
        let creep: Creep = Game.creeps[creepName];

        this.valueLeft -= creep.store.getUsedCapacity() as number;
    }
    public unassignCreep(creepName: string)
    {
        super.unassignCreep(creepName);

        let creep: Creep = Game.creeps[creepName];

        this.valueLeft += creep.store.getUsedCapacity() as number;
    }
    public updateValueLeft()
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(this.id);
        if (!structure)
        {
            return;
        }

        this.valueLeft = structure.store.getFreeCapacity() as number;

        this.creeps.forEach(creepName =>
        {
            let creep: Creep = Game.creeps[creepName];

            this.valueLeft -= creep.store.getUsedCapacity();
        });

    }
    public checkCreepMatches(creep: Creep): boolean
    {
        return creep.store.getCapacity() > 0 && creep.memory.role === GeneralTask.TaskType.transport && (creep.store.getUsedCapacity() >= creep.store.getCapacity() / 2 || creep.store.getUsedCapacity() >= this.valueLeft);
    }
}
