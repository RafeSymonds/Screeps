import * as position from "../positionCalculations";
import { strict } from "assert";
import { drop, forEach, take, words } from "lodash";
import { worker } from "cluster";
import { createPrivateKey } from "crypto";


declare global
{

}

/*

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

export class Task
{
    type: TaskType;
    workType: WorkType;
    valueLeft: number = 0;
    priority: number;

    creeps: Creep[] = [];


    constructor(type: TaskType, workType: WorkType, valueLeft: number, priority: number)
    {
        this.type = type;
        this.workType = workType;
        this.valueLeft = valueLeft;
        this.priority = priority;
    }

    public getPosition(): RoomPosition | null
    {
        return null;
    }
    public action(creep: Creep)
    { }
    public getID(): string | null
    {
        return null;
    }
    public taskAssignCreep(creep: Creep)
    { }
    public unassignCreep(creep: Creep)
    { }
    public updateValueLeft()
    { }
    public updateValueLeftFromDeath(creepMemory: CreepMemory)
    { }
    public checkCreepMatches(creep: Creep): boolean
    {
        return false;
    }
}

export class TransportTask extends Task
{
    structureID: Id<AnyStoreStructure>;
    constructor(priority: number, structureID: Id<AnyStoreStructure>)
    {
        let valueLeft: number = 100;
        super(TaskType.transport, WorkType.none, valueLeft, priority);
        this.structureID = structureID;
    }
    public getPosition(): RoomPosition | null
    {
        let structure: AnyStructure | null = Game.getObjectById(this.structureID)
        if (structure)
        {
            return structure.pos;
        }
        else
        {
            return null
        }
    }
    public action(creep: Creep)
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(this.structureID);
        if (structure)
        {
            if (structure.store.getFreeCapacity(RESOURCE_ENERGY) !== 0)
            {
                if (creep.store[RESOURCE_ENERGY] > 0)
                {
                    let enegyToTransfer = Math.min(creep.store[RESOURCE_ENERGY], structure.store.getFreeCapacity() as number);
                    if (creep.transfer(structure, RESOURCE_ENERGY, enegyToTransfer) === ERR_NOT_IN_RANGE)
                    {
                        creep.moveTo(structure);
                    }
                }
                else
                {
                    creep.memory.taskID.pop();
                }
            }
            else
            {
                this.valueLeft = 0;
                creep.memory.taskID.pop();
            }
        }

    }
    public getID(): string | null
    {
        return this.structureID;
    }
    public taskAssignCreep(creep: Creep)
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(this.structureID);
        if (structure)
        {
            this.valueLeft -= creep.store[RESOURCE_ENERGY];
        }
    }
    public unassignCreep(creep: Creep)
    {
        this.valueLeft += creep.store[RESOURCE_ENERGY];
    }
    public updateValueLeft(): void
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(this.structureID);
        if (structure)
        {
            this.valueLeft = structure.store.getFreeCapacity(RESOURCE_ENERGY) as number;
        }
    }
    public checkCreepMatches(creep: Creep): boolean
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(this.structureID);
        if (structure)
        {
            return creep.store.getCapacity() > 0 && (creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2 || creep.store[RESOURCE_ENERGY] >= this.valueLeft) && creep.memory.role === TaskType.transport;
        }
        return false;
    }
}

export class HarvestTask extends Task
{
    sourceID: Id<Source>;
    containerID: Id<StructureContainer> | null;
    constructor(sourceID: Id<Source>, containerID: Id<StructureContainer> | null = null)
    {
        let source: Source | null = Game.getObjectById(sourceID);
        let valueLeft = 9;
        if (source)
        {
            //get nearby tiles and check if a creep can mine there
            let terrain = source.room.lookForAtArea(LOOK_TERRAIN, source.pos.y - 1, source.pos.x - 1, source.pos.y + 1, source.pos.x + 1, true);
            terrain.forEach(terrainItem =>
            {
                if (terrainItem.terrain === "wall")
                {
                    valueLeft -= 1;
                }
            });
            global.roomMemory[source.room.name].harvesterLimit += valueLeft;
        }
        console.log("value left in source", valueLeft);
        super(TaskType.work, WorkType.harvest, valueLeft, 10);
        this.sourceID = sourceID;
        this.containerID = containerID;
    }

    public getPosition(): RoomPosition | null
    {
        let source: Source | null = Game.getObjectById(this.sourceID)
        if (source)
        {
            return source.pos;
        }
        else
        {
            return null
        }
    }
    public action(creep: Creep)
    {
        if (creep.memory.role === TaskType.harvest)
        {
            if (this.containerID)
            {
                let container: StructureContainer | null = Game.getObjectById(this.containerID);
                if (container)
                {
                    if (container.pos.isEqualTo(creep.pos))
                    {
                        let source: Source | null = Game.getObjectById(this.sourceID);
                        if (source)
                        {
                            creep.harvest(source);
                        }
                    }
                    else
                    {
                        creep.moveTo(container);
                    }
                }
            }
            else
            {
                let source: Source | null = Game.getObjectById(this.sourceID);
                if (source)
                {
                    if (creep.harvest(source) === ERR_NOT_IN_RANGE)
                    {
                        creep.moveTo(source);
                    }
                }
            }
        }
        else
        {
            let source: Source | null = Game.getObjectById(this.sourceID);
            if (source && creep.store[RESOURCE_ENERGY] < creep.store.getCapacity())
            {
                if (creep.harvest(source) === ERR_NOT_IN_RANGE)
                {
                    creep.moveTo(source);
                }
            }
            else
            {
                this.valueLeft += 1;
                creep.memory.taskID.pop();
            }
        }
    }
    public getID(): string
    {
        return this.sourceID;
    }
    public taskAssignCreep(creep: Creep)
    {
        this.valueLeft--;
        console.log("assigning creep to task", this.valueLeft);
    }
    public unassignCreep(creep: Creep)
    {
        this.valueLeft++;
    }
    public updateValueLeft(): void
    {

    }
    public checkCreepMatches(creep: Creep): boolean
    {
        let source: Source | null = Game.getObjectById(this.sourceID);
        if (source)
        {
            return ((creep.memory.role === TaskType.work && creep.store[RESOURCE_ENERGY] < creep.store.getCapacity() / 2) || creep.memory.role === TaskType.harvest);
        }
        return false;
    }
    public updateValueLeftFromDeath(creepMemory: CreepMemory)
    {
        this.valueLeft++;
    }
}

export class BuildTask extends Task
{
    constructionSiteID: Id<ConstructionSite>;
    constructor(priority: number, constructionSiteID: Id<ConstructionSite>)
    {
        let valueLeft: number = 0;
        let constructionSite: ConstructionSite | null = Game.getObjectById(constructionSiteID)
        if (constructionSite)
        {
            valueLeft = constructionSite.progressTotal - constructionSite.progress;
        }
        super(TaskType.work, WorkType.build, valueLeft, priority);
        this.constructionSiteID = constructionSiteID;
    }
    public getPosition(): RoomPosition | null
    {
        let constructionSite: ConstructionSite | null = Game.getObjectById(this.constructionSiteID)
        if (constructionSite)
        {
            return constructionSite.pos;
        }
        else
        {
            return null
        }
    }
    public action(creep: Creep)
    {
        let constructionSite: ConstructionSite | null = Game.getObjectById(this.constructionSiteID);
        if (constructionSite)
        {
            if (creep.store[RESOURCE_ENERGY] > 0)
            {
                if (creep.build(constructionSite) === ERR_NOT_IN_RANGE)
                {
                    creep.moveTo(constructionSite);
                }
            } else
            {
                creep.memory.taskID.pop();
            }
        }
        else
        {
            // when build is complete add new task
            creep.memory.taskID.pop();
            delete global.roomMemory[creep.room.name].tasks[this.constructionSiteID];
        }

    }
    public getID(): string
    {
        return this.constructionSiteID;
    }
    public taskAssignCreep(creep: Creep)
    {
        this.valueLeft -= creep.store[RESOURCE_ENERGY];
    }
    public unassignCreep(creep: Creep)
    {
        this.valueLeft += creep.store[RESOURCE_ENERGY];
    }
    public updateValueLeft(): void
    {
        let constructionSite: ConstructionSite | null = Game.getObjectById(this.constructionSiteID);
        if (constructionSite)
        {
            this.valueLeft = constructionSite.progressTotal - constructionSite.progress;
        }
    }
    public checkCreepMatches(creep: Creep): boolean
    {
        let constructionSite: ConstructionSite | null = Game.getObjectById(this.constructionSiteID);
        if (constructionSite && constructionSite.room)
        {
            return creep.store.getCapacity() > 0 && creep.memory.role === TaskType.work && creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2;
        }
        return false;
    }
}
export class UpgradeControllerTask extends Task
{
    controllerID: Id<StructureController>;
    constructor(controllerID: Id<StructureController>)
    {
        super(TaskType.work, WorkType.upgradeController, 10000, 30);
        this.controllerID = controllerID;
    }
    public getPosition(): RoomPosition | null
    {
        let controller: StructureController | null = Game.getObjectById(this.controllerID);
        if (controller)
        {
            return controller.pos;
        }
        else
        {
            return null
        }
    }
    public action(creep: Creep)
    {
        let controller: StructureController | null = Game.getObjectById(this.controllerID);
        if (controller && creep.store[RESOURCE_ENERGY] > 0)
        {
            if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE)
            {
                creep.moveTo(controller);
            }
        }
        else
        {
            creep.memory.taskID.pop();
        }
    }
    public getID(): string | null
    {
        return this.controllerID;
    }
    public taskAssignCreep(creep: Creep) { }
    public unassignCreep(creep: Creep)
    {
    }
    public updateValueLeft(): void
    {
    }

    public checkCreepMatches(creep: Creep): boolean
    {
        let controller: StructureController | null = Game.getObjectById(this.controllerID);
        if (controller && controller.room)
        {
            return creep.store.getCapacity() > 0 && creep.memory.role === TaskType.work && creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2;
        }
        return false;
    }
}
export class CollectEnergyTask extends Task
{
    structureID: Id<AnyStoreStructure>;
    constructor(structureID: Id<AnyStoreStructure>)
    {
        let structure: AnyStructure | null = Game.getObjectById(structureID);
        let valueLeft: number = 0;
        if (structure)
        {
            valueLeft = structure.store[RESOURCE_ENERGY];
        }
        super(TaskType.collect, WorkType.collectStructure, valueLeft, 3);
        this.structureID = structureID;
    }
    public getPosition(): RoomPosition | null
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(this.structureID);
        if (structure)
        {
            return structure.pos;
        }
        else
        {
            return null
        }
    }
    public action(creep: Creep)
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(this.structureID);
        if (structure && structure.store[RESOURCE_ENERGY] > 0)
        {
            if (creep.store.getFreeCapacity() > 0)
            {
                let enegyToTransfer = Math.min(creep.store.getFreeCapacity(), structure.store[RESOURCE_ENERGY] as number);
                if (creep.withdraw(structure, RESOURCE_ENERGY, enegyToTransfer) === ERR_NOT_IN_RANGE)
                {
                    creep.moveTo(structure);
                }
            }
            else
            {
                creep.memory.taskID.pop();
            }
        }
        else
        {
            this.valueLeft = 0;
            creep.memory.taskID.pop();
        }
    }
    public getID(): string | null
    {
        return this.structureID;
    }
    public taskAssignCreep(creep: Creep)
    {
        this.valueLeft = Math.max(this.valueLeft - creep.store.getFreeCapacity(), 0);
    }
    public unassignCreep(creep: Creep)
    {
        this.valueLeft -= creep.store.getFreeCapacity();
    }
    public updateValueLeft(): void
    {
        let structure: AnyStructure | null = Game.getObjectById(this.structureID);
        if (structure)
        {
            this.valueLeft = structure.store[RESOURCE_ENERGY];
        }
    }
    public checkCreepMatches(creep: Creep): boolean
    {
        let structure: Structure | null = Game.getObjectById(this.structureID);
        if (structure)
        {
            return creep.store.getCapacity() > 0 && creep.store[RESOURCE_ENERGY] < creep.store.getCapacity() / 2;
        }
        return false;
    }
}
export class CollectDroppedResource extends Task
{
    resourceID: Id<Resource>;
    constructor(resourceID: Id<Resource>)
    {
        let resource: Resource | null = Game.getObjectById(resourceID);
        let valueLeft: number = 0;
        if (resource)
        {
            valueLeft = resource.amount;
        }
        super(TaskType.collect, WorkType.collectResource, valueLeft, 3);
        this.resourceID = resourceID;
    }
    public getPosition(): RoomPosition | null
    {
        let resource: Resource | null = Game.getObjectById(this.resourceID);
        if (resource)
        {
            return resource.pos;
        }
        else
        {
            return null
        }
    }
    public action(creep: Creep)
    {
        let resource: Resource | null = Game.getObjectById(this.resourceID);
        if (resource && resource.amount > 0)
        {
            if (creep.store.getFreeCapacity() > 0)
            {
                if (creep.pickup(resource) === ERR_NOT_IN_RANGE)
                {
                    creep.moveTo(resource);
                }
                else
                {
                    this.updateValueLeft();
                }
            }
            else
            {
                creep.memory.taskID.pop();
            }
        }
        else
        {
            creep.memory.taskID.pop();
        }
    }
    public getID(): string | null
    {
        return this.resourceID;
    }
    public taskAssignCreep(creep: Creep)
    {
        this.valueLeft = Math.max(this.valueLeft - creep.store.getFreeCapacity(), 0);
    }
    public unassignCreep(creep: Creep)
    {
        this.valueLeft -= creep.store.getFreeCapacity();
    }
    public updateValueLeft(): void
    {
        let resource: Resource | null = Game.getObjectById(this.resourceID);

        if (resource)
        {
            this.valueLeft = resource.amount;
        }
    }
    public checkCreepMatches(creep: Creep): boolean
    {
        let resource: Resource | null = Game.getObjectById(this.resourceID);
        if (resource)
        {
            return creep.store.getCapacity() > 0 && creep.store[RESOURCE_ENERGY] < creep.store.getCapacity() / 2;
        }
        return false;
    }
}

export class DropResourceTask extends Task
{
    dropLocation: RoomPosition;
    constructor(dropLocation: RoomPosition)
    {
        super(TaskType.transport, WorkType.none, 100, 20);
        this.dropLocation = dropLocation;
    }
    public getPosition(): RoomPosition | null
    {
        return this.dropLocation;
    }
    public action(creep: Creep)
    {

        if (creep.store.getFreeCapacity() > 0)
        {
            if (creep.pos.isEqualTo(this.dropLocation))
            {
                creep.drop(RESOURCE_ENERGY);
                creep.memory.taskID.pop();
            }
            else
            {
                creep.moveTo(this.dropLocation);
            }
        }
        else
        {
            creep.memory.taskID.pop();
        }
    }
    public getID(): string | null
    {
        return this.dropLocation.roomName + "" + this.dropLocation.x + "" + this.dropLocation.y;
    }
    public taskAssignCreep(creep: Creep)
    {

    }
    public unassignCreep(creep: Creep)
    {

    }
    public updateValueLeft(): void
    {

    }
    public checkCreepMatches(creep: Creep): boolean
    {
        return creep.memory.role === TaskType.transport && creep.store.getCapacity() > 0 && creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2;
    }
}

export function setUpTasks(room: Room): void
{
    let containerCount: number = 0;

    let spawns: StructureSpawn[] = room.find(FIND_MY_SPAWNS);
    if (spawns.length > 0)
    {
        global.roomMemory[room.name].baseCenter = [spawns[0].pos.x, spawns[0].pos.y + 2];
    }

    const sources: Source[] = room.find(FIND_SOURCES);
    sources.forEach(source =>
    {
        if (!(source.id in global.roomMemory[room.name].tasks))
        {
            let newTask = new HarvestTask(source.id);
            global.roomMemory[room.name].tasks[source.id] = newTask;
        }
    });



    const structures: Structure[] = room.find(FIND_STRUCTURES);
    structures.forEach(structure =>
    {
        if (!(structure.id in global.roomMemory[room.name].tasks))
        {

            let priority = 0;
            let newTask: Task | null = null;
            switch (structure.structureType)
            {
                case STRUCTURE_CONTAINER:
                    priority = -1;
                    containerCount++;
                    break;
                case STRUCTURE_EXTENSION:
                    priority = 3;
                    break;
                case STRUCTURE_SPAWN:
                    priority = 3;
                    break;
                case STRUCTURE_STORAGE:
                    priority = 5;
                    break;
                case STRUCTURE_CONTROLLER:
                    priority = 11;
                    break;
                case STRUCTURE_TOWER:
                    priority = 1;
                    break;
                default:
                    break;
            }
            if (priority > 0)
            {
                if (priority === 11)
                {
                    newTask = new UpgradeControllerTask(structure.id as Id<StructureController>)
                    global.roomMemory[room.name].tasks[structure.id] = newTask as Task;
                }
                else
                {
                    console.log("Creating new transport task");
                    newTask = new TransportTask(priority, structure.id as Id<AnyStoreStructure>)
                    console.log("transport task with a value of " + newTask.valueLeft);
                    global.roomMemory[room.name].tasks[structure.id] = newTask;
                }
            }
            else
            {
                if (priority === -1)
                {
                    // container as a resource location
                    let collectEnergyTask: CollectEnergyTask = new CollectEnergyTask(structure.id as unknown as Id<AnyStoreStructure>);
                    global.roomMemory[room.name].tasks[structure.id] = collectEnergyTask;
                    let sources: Source[] = structure.pos.findInRange(FIND_SOURCES, 1);

                    if (sources.length > 0)
                    {
                        let source = global.roomMemory[room.name].tasks[sources[0].id] as HarvestTask;
                        source.containerID = structure.id as unknown as Id<StructureContainer>;
                    }
                }
            }
        }
    });

    if (containerCount >= 2)
    {
        global.roomMemory[room.name].harvesterLimit = 2;
    }

    const constructionSites: ConstructionSite[] = room.find(FIND_CONSTRUCTION_SITES);
    constructionSites.forEach(constructionSite =>
    {
        if (!(constructionSite.id in global.roomMemory[room.name].tasks))
        {
            let newTask = new BuildTask(6, constructionSite.id);
            global.roomMemory[room.name].tasks[constructionSite.id] = newTask;
        }

    });
    const resources: Resource[] = room.find(FIND_DROPPED_RESOURCES);
    resources.forEach(resource =>
    {
        if (!(resource.id in global.roomMemory[room.name].tasks))
        {
            let newTask = new CollectDroppedResource(resource.id);
            global.roomMemory[room.name].tasks[resource.id] = newTask;
        }
    });



    //setup resource drop
    //let dropLocationTask = new DropResourceTask();

}

export function assignAllCreeps(room: Room)
{
    let creeps: Creep[] = room.find(FIND_MY_CREEPS);
    creeps.forEach(creep =>
    {
        if (creep.memory.taskID)
        {
            if (creep.memory.taskID.length > 0)
            {
                let task: Task = global.roomMemory[room.name].tasks[creep.memory.taskID[0]];
                if (task !== undefined)
                {
                    task.taskAssignCreep(creep);
                }
            }
            if (creep.memory.role === TaskType.harvest)
            {
                global.roomMemory[room.name].harvesterCreepCount++;

            }
            else if (creep.memory.role === TaskType.work)
            {
                global.roomMemory[room.name].workerCreepCount++;
            }
            else if (creep.memory.role === TaskType.transport)
            {
                global.roomMemory[room.name].transporterCreepCount++;
            }
        }
    });
    console.log(global.roomMemory[room.name].harvesterCreepCount);
    console.log(global.roomMemory[room.name].harvesterLimit);
}

export function updatePriorities(room: Room)
{
    let tasks: [string, Task][] = Object.entries(global.roomMemory[room.name].tasks);
    tasks.forEach(task =>
    {
        task[1].updateValueLeft();
    });
}

*/
