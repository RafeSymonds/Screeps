import * as position from "../positionCalculations";
import { strict } from "assert";
import { drop, forEach, take, words } from "lodash";
import { worker } from "cluster";
import { createPrivateKey } from "crypto";
import { Position } from "source-map";
import internal from "stream";
import { setFlagsFromString } from "v8";
import * as GeneralTask from "Tasks/generalTask";


export class HarvestTask extends GeneralTask.Task
{
    id: Id<Source>;
    maxHarvestSpots: number;
    harvestSpotsLeft: number;
    workerPartsLeft: number;

    containerID: Id<StructureContainer> | null;

    constructor(sourceID: Id<Source>, containerID: Id<StructureContainer> | null = null)
    {
        let source: Source | null = Game.getObjectById(sourceID);

        super(GeneralTask.TaskType.harvest, GeneralTask.WorkType.harvest, 10, source!.pos);

        this.id = source!.id;
        this.maxHarvestSpots = 8;
        this.workerPartsLeft = 5;
        this.containerID = containerID;

        if (source)
        {
            //get nearby tiles and check if a creep can mine there
            let terrain = source.room.lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true);
            terrain.forEach(terrainItem =>
            {
                if (terrainItem.terrain === "wall")
                {
                    this.harvestSpotsLeft -= 1;
                }
            });
        }

        this.harvestSpotsLeft = this.maxHarvestSpots;
    }

    public getID(): string
    {
        return this.id;
    }

    public processCreepActions()
    {
        let source: Source | null = Game.getObjectById(this.id);

        if (!source)
        {
            this.deleteTask();
            return;
        }

        this.creeps.forEach(creepName =>
        {
            let creep = Game.creeps[creepName];

            if (creep.store.getFreeCapacity() == 0)
            {
                this.unassignCreep(creepName);
            }
            else if (this.containerID)
            {
                let container: StructureContainer | null = Game.getObjectById(this.containerID);

                if (container && source)
                {
                    if (container.pos.isEqualTo(creep.pos))
                    {
                        creep.harvest(source);
                    }
                    else
                    {
                        creep.moveTo(container);
                    }
                }
                else
                {
                    this.containerID = null;
                }
            }
            else
            {
                if (source && creep.harvest(source) === ERR_NOT_IN_RANGE)
                {
                    creep.moveTo(source);
                }
            }
        });
    }
    public hasValueLeft(): boolean
    {
        return this.harvestSpotsLeft > 0 && this.workerPartsLeft > 0;
    }
    public taskAssignCreep(creepName: string)
    {
        super.taskAssignCreep(creepName);

        this.harvestSpotsLeft -= 1;
        let creep = Game.creeps[creepName];
        this.workerPartsLeft -= creep.getActiveBodyparts(WORK);
    }
    public unassignCreep(creepName: string)
    {
        super.unassignCreep(creepName);

        let creep: Creep = Game.creeps[creepName];

        this.harvestSpotsLeft += 1;
        this.workerPartsLeft += creep.getActiveBodyparts(WORK);
    }
    public updateValueLeft()
    {
        this.harvestSpotsLeft = this.maxHarvestSpots - super.numCreepsAssigned();
        this.workerPartsLeft = 5;
        this.creeps.forEach(creepName =>
        {
            let creep: Creep = Game.creeps[creepName];

            this.workerPartsLeft = creep.getActiveBodyparts(WORK);
        });

    }
    public checkCreepMatches(creep: Creep): boolean
    {
        return creep.memory.role === GeneralTask.TaskType.harvest || (creep.memory.role === GeneralTask.TaskType.work && creep.store.getUsedCapacity() < creep.store.getCapacity() / 2);
    }
}
