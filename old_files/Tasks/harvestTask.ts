import * as position from "../positionCalculations";
import { strict } from "assert";
import { drop, forEach, take, words } from "lodash";
import { worker } from "cluster";
import { createPrivateKey } from "crypto";
import { Position } from "source-map";
import internal from "stream";
import { setFlagsFromString } from "v8";
import * as GeneralTask from "Tasks/generalTask";
import { CollectDroppedResource } from "./collectDroppedResource";

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

    public processCreepAction(creep: Creep)
    {
        let source: Source | null = Game.getObjectById(this.id);

        if (!source)
        {
            this.deleteTask();
            return;
        }

        if (creep.store.getFreeCapacity() == 0)
        {
            this.unassignCreep(creep.name);
        }
        else if (this.containerID)
        {
            let container: StructureContainer | null = Game.getObjectById(this.containerID);

            if (container)
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
            let harvestErroCode = creep.harvest(source);
            if (harvestErroCode === ERR_NOT_IN_RANGE)
            {
                creep.moveTo(source);
            }
            else if (harvestErroCode === OK)
            {
                let objects: LookAtResult[] = source.room.lookAt(creep.pos);
                objects.forEach(object =>
                {
                    if (object.type == LOOK_ENERGY)
                    {
                        let energyLocations = global.roomMemory[source!.room.name].energyLocations;
                        if (object!.energy!.id in energyLocations)
                        {
                            energyLocations[object!.energy!.id].updateValueLeft();
                        }
                        else
                        {
                            energyLocations[object!.energy!.id] = new CollectDroppedResource(object!.energy!.id);
                        }
                    }
                });
            }
        }
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

        creep.memory.workAmountLeft = creep.store.getUsedCapacity();

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
    public checkCreepMatches(creep: Creep): GeneralTask.CreepMatchesTask
    {
        if (creep.memory.role === GeneralTask.TaskType.harvest)
        {
            return GeneralTask.CreepMatchesTask.true;
        }

        if (creep.memory.role === GeneralTask.TaskType.work && creep.store.getUsedCapacity() < creep.store.getCapacity() / 2)
        {
            return GeneralTask.CreepMatchesTask.true;
        }
        return GeneralTask.CreepMatchesTask.false;
    }
}
