import * as position from "./positionCalculations";
import { strict } from "assert";
import { take, words } from "lodash";
import { worker } from "cluster";
import { createPrivateKey } from "crypto";

export enum TaskType
{
    work,
    transport,
    collect,
    harvest
}

export enum WorkType
{
    harvest,
    build,
    repair,
    upgradeController,
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

    public static getPosition(task: Task): RoomPosition | null
    {
        if (task.workType === WorkType.harvest)
        {
            return HarvestTask.getPosition(task as HarvestTask);
        }
        else if (task.workType === WorkType.upgradeController)
        {
            return UpgradeControllerTask.getPosition(task as UpgradeControllerTask);
        }
        else if (task.type === TaskType.transport)
        {
            return TransportTask.getPosition(task as TransportTask);
        }
        else if (task.workType === WorkType.build)
        {
            return BuildTask.getPosition(task as BuildTask);
        }
        else if (task.type === TaskType.collect)
        {
            return CollectEnergyTask.getPosition(task as CollectEnergyTask);
        }
        return null;
    }
    public static action(task: Task, creep: Creep, room: Room)
    {
        if (task.workType === WorkType.harvest)
        {
            HarvestTask.action(task as HarvestTask, creep, room);
            return;
        }
        else if (task.workType === WorkType.upgradeController)
        {
            UpgradeControllerTask.action(task as UpgradeControllerTask, creep, room);
        }
        else if (task.type === TaskType.transport)
        {
            TransportTask.action(task as TransportTask, creep, room);
        }
        else if (task.workType === WorkType.build)
        {
            BuildTask.action(task as BuildTask, creep, room);
        }
        else if (task.type === TaskType.collect)
        {
            CollectEnergyTask.action(task as CollectEnergyTask, creep, room);
        }
    }
    public static getID(task: Task): string | null
    {
        if (task.workType === WorkType.harvest)
        {
            return HarvestTask.getID(task as HarvestTask);
        }
        else if (task.workType === WorkType.upgradeController)
        {
            return UpgradeControllerTask.getID(task as UpgradeControllerTask);
        }
        else if (task.type === TaskType.transport)
        {
            return TransportTask.getID(task as TransportTask);
        }
        else if (task.workType === WorkType.build)
        {
            return BuildTask.getID(task as BuildTask);
        }
        else if (task.type === TaskType.collect)
        {
            return CollectEnergyTask.getID(task as CollectEnergyTask);
        }
        return null;
    }
    public static taskAssignCreep(task: Task, creep: Creep, room: Room)
    {
        if (task.workType === WorkType.harvest)
        {
            HarvestTask.taskAssignCreep(task as HarvestTask, creep, room);
        }
        else if (task.workType === WorkType.upgradeController)
        {
            UpgradeControllerTask.taskAssignCreep(task as UpgradeControllerTask, creep, room);
        }
        else if (task.type === TaskType.transport)
        {
            TransportTask.taskAssignCreep(task as TransportTask, creep, room);
        }
        else if (task.workType === WorkType.build)
        {
            BuildTask.taskAssignCreep(task as BuildTask, creep, room);
        }
        else if (task.type === TaskType.collect)
        {
            CollectEnergyTask.taskAssignCreep(task as CollectEnergyTask, creep, room);
        }
    }
    public static tempTaskAssignCreep(task: Task, creep: Creep, room: Room)
    {
        if (task.workType === WorkType.harvest)
        {
            HarvestTask.tempTaskAssignCreep(task as HarvestTask, creep, room);
        }
        else if (task.workType === WorkType.upgradeController)
        {
            UpgradeControllerTask.tempTaskAssignCreep(task as UpgradeControllerTask, creep, room);
        }
        else if (task.type === TaskType.transport)
        {
            TransportTask.tempTaskAssignCreep(task as TransportTask, creep, room);
        }
        else if (task.workType === WorkType.build)
        {
            BuildTask.tempTaskAssignCreep(task as BuildTask, creep, room);
        }
    }
    public static tempUnassignCreep(task: Task, creep: Creep, room: Room)
    {
        if (task.workType === WorkType.harvest)
        {
            HarvestTask.tempUnassignCreep(task as HarvestTask, creep, room);
        }
        else if (task.workType === WorkType.upgradeController)
        {
            UpgradeControllerTask.tempUnassignCreep(task as UpgradeControllerTask, creep, room);
        }
        else if (task.type === TaskType.transport)
        {
            TransportTask.tempUnassignCreep(task as TransportTask, creep, room);
        }
        else if (task.workType === WorkType.build)
        {
            BuildTask.tempUnassignCreep(task as BuildTask, creep, room);
        }
        else if (task.type === TaskType.collect)
        {
            CollectEnergyTask.tempUnassignCreep(task as CollectEnergyTask, creep, room);
        }
    }
    public static checkCreepMatches(task: Task, creep: Creep, room: Room): boolean
    {
        if (task.workType === WorkType.harvest && creep.memory.role === TaskType.harvest)
        {
            return true;
        }
        else if (creep.memory.role === task.type)
        {
            if (task.workType === WorkType.build || task.type === TaskType.transport || task.workType === WorkType.upgradeController || task.workType === WorkType.repair)
            {
                return creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2;
            }
            else if (task.workType === WorkType.harvest)
            {
                return creep.store[RESOURCE_ENERGY] < creep.store.getCapacity() / 2;
            }
        }
        else if (task.type === TaskType.collect && creep.store.getCapacity() > 0)
        {
            return creep.store[RESOURCE_ENERGY] < creep.store.getCapacity() / 2;
        }
        else if (task.type === TaskType.transport && (room.controller?.level as number < 3 || room.memory.transporterCreepCount < 2))
        {
            return creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2;
        }


        return false;
    }
    public static updateMemory(task: Task, room: Room)
    {
        let id: string | null = this.getID(task);
        if (id)
        {
            room.memory.tasks[id].valueLeft = task.valueLeft;
        }
    }
    public static updateValueLeft(task: Task, room: Room)
    {
        if (task.workType === WorkType.harvest)
        {
            HarvestTask.updateValueLeft(task as HarvestTask, room);
        }
        else if (task.workType === WorkType.upgradeController)
        {
            UpgradeControllerTask.updateValueLeft(task as UpgradeControllerTask, room);
        }
        else if (task.type === TaskType.transport)
        {
            TransportTask.updateValueLeft(task as TransportTask, room);
        }
        else if (task.workType === WorkType.build)
        {
            BuildTask.updateValueLeft(task as BuildTask, room);
        }
        else if (task.type === TaskType.collect)
        {
            CollectEnergyTask.updateValueLeft(task as CollectEnergyTask, room);
        }
    }
    public static updateValueLeftFromDeath(task: Task, creepMemory: CreepMemory, room: Room)
    {
        if (task.type === TaskType.harvest)
        {
            task.valueLeft += 1;
        }
        else
        {
            this.updateValueLeft(task, room);
        }
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
    public static getPosition(task: TransportTask): RoomPosition | null
    {
        let structure: AnyStructure | null = Game.getObjectById(task.structureID)
        if (structure)
        {
            return structure.pos;
        }
        else
        {
            return null
        }
    }
    public static action(task: TransportTask, creep: Creep, room: Room)
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(task.structureID);
        if (structure && creep.store[RESOURCE_ENERGY] > 0 && structure.store.getFreeCapacity(RESOURCE_ENERGY) !== 0)
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
    public static getID(task: TransportTask): string | null
    {
        return task.structureID;
    }
    public static taskAssignCreep(task: TransportTask, creep: Creep, room: Room)
    {
        task.valueLeft -= creep.store[RESOURCE_ENERGY];
        room.memory.tasks[task.structureID].valueLeft = task.valueLeft;
    }
    public static tempTaskAssignCreep(task: TransportTask, creep: Creep, room: Room)
    {
        task.valueLeft -= creep.store[RESOURCE_ENERGY];
    }
    public static tempUnassignCreep(task: TransportTask, creep: Creep, room: Room)
    {
        task.valueLeft += creep.store[RESOURCE_ENERGY];
    }
    public static updateValueLeft(task: TransportTask, room: Room): void
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(task.structureID);
        if (structure)
        {
            task.valueLeft = structure.store.getFreeCapacity(RESOURCE_ENERGY) as number;
            room.memory.tasks[task.structureID].valueLeft = task.valueLeft;
        }
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
        }
        super(TaskType.work, WorkType.harvest, valueLeft, 10);
        this.sourceID = sourceID;
        this.containerID = containerID;
    }

    public static getPosition(task: HarvestTask): RoomPosition | null
    {
        let source: Source | null = Game.getObjectById(task.sourceID)
        if (source)
        {
            return source.pos;
        }
        else
        {
            return null
        }
    }
    public static action(task: HarvestTask, creep: Creep, room: Room)
    {
        if (task.containerID && creep.memory.role === TaskType.harvest)
        {
            let container: StructureContainer | null = Game.getObjectById(task.containerID);
            if (container)
            {
                if (container.pos.isEqualTo(creep.pos))
                {
                    let source: Source | null = Game.getObjectById(task.sourceID);
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
            let source: Source | null = Game.getObjectById(task.sourceID);
            if (source && creep.store[RESOURCE_ENERGY] < creep.store.getCapacity())
            {
                if (creep.harvest(source) === ERR_NOT_IN_RANGE)
                {
                    creep.moveTo(source);
                }
            }
            else
            {
                task.valueLeft += creep.getActiveBodyparts(WORK);
                room.memory.tasks[task.sourceID].valueLeft = task.valueLeft;
                creep.memory.taskID.pop();
            }
        }


    }
    public static getID(task: HarvestTask): string
    {
        return task.sourceID;
    }
    public static taskAssignCreep(task: HarvestTask, creep: Creep, room: Room)
    {
        task.valueLeft -= creep.getActiveBodyparts(WORK);
        room.memory.tasks[task.sourceID].valueLeft = task.valueLeft;
    }
    public static tempTaskAssignCreep(task: HarvestTask, creep: Creep, room: Room)
    {
        task.valueLeft -= creep.getActiveBodyparts(WORK);
    }
    public static tempUnassignCreep(task: HarvestTask, creep: Creep, room: Room)
    {
        task.valueLeft += creep.getActiveBodyparts(WORK);
    }
    public static updateValueLeft(task: HarvestTask, room: Room): void
    {

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
    public static getPosition(task: BuildTask): RoomPosition | null
    {
        let constructionSite: ConstructionSite | null = Game.getObjectById(task.constructionSiteID)
        if (constructionSite)
        {
            return constructionSite.pos;
        }
        else
        {
            return null
        }
    }
    public static action(task: BuildTask, creep: Creep, room: Room)
    {
        let constructionSite: ConstructionSite | null = Game.getObjectById(task.constructionSiteID);
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
            delete room.memory.tasks[task.constructionSiteID];
        }

    }
    public static getID(task: BuildTask): string
    {
        return task.constructionSiteID;
    }
    public static taskAssignCreep(task: BuildTask, creep: Creep, room: Room)
    {
        task.valueLeft -= creep.store[RESOURCE_ENERGY];

        room.memory.tasks[task.constructionSiteID].valueLeft = task.valueLeft;
    }
    public static tempTaskAssignCreep(task: BuildTask, creep: Creep, room: Room)
    {
        task.valueLeft -= creep.store[RESOURCE_ENERGY];
    }
    public static tempUnassignCreep(task: BuildTask, creep: Creep, room: Room)
    {
        task.valueLeft += creep.store[RESOURCE_ENERGY];
    }
    public static updateValueLeft(task: BuildTask, room: Room): void
    {
        let constructionSite: ConstructionSite | null = Game.getObjectById(task.constructionSiteID);
        if (constructionSite)
        {
            task.valueLeft = constructionSite.progressTotal - constructionSite.progress;
            room.memory.tasks[task.constructionSiteID].valueLeft = task.valueLeft;
        }
    }
}
export class UpgradeControllerTask extends Task
{
    controllerID: Id<StructureController>;
    constructor(controllerID: Id<StructureController>)
    {
        super(TaskType.work, WorkType.upgradeController, 10000, 10);
        this.controllerID = controllerID;
    }
    public static getPosition(task: UpgradeControllerTask): RoomPosition | null
    {
        let controller: StructureController | null = Game.getObjectById(task.controllerID);
        if (controller)
        {
            return controller.pos;
        }
        else
        {
            return null
        }
    }
    public static action(task: UpgradeControllerTask, creep: Creep, room: Room)
    {
        let controller: StructureController | null = Game.getObjectById(task.controllerID);
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
    public static getID(task: UpgradeControllerTask): string | null
    {
        return task.controllerID;
    }
    public static taskAssignCreep(task: UpgradeControllerTask, creep: Creep, room: Room) { }
    public static tempTaskAssignCreep(task: UpgradeControllerTask, creep: Creep, room: Room)
    {
    }
    public static tempUnassignCreep(task: UpgradeControllerTask, creep: Creep, room: Room)
    {
    }
    public static updateValueLeft(task: UpgradeControllerTask, room: Room): void
    {
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
        super(TaskType.collect, WorkType.none, valueLeft, 3);
        this.structureID = structureID;
    }
    public static getPosition(task: CollectEnergyTask): RoomPosition | null
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(task.structureID);
        if (structure)
        {
            return structure.pos;
        }
        else
        {
            return null
        }
    }
    public static action(task: CollectEnergyTask, creep: Creep, room: Room)
    {
        let structure: AnyStoreStructure | null = Game.getObjectById(task.structureID);
        if (structure && structure.store[RESOURCE_ENERGY] > 0 && creep.store.getFreeCapacity() > 0)
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
    public static getID(task: CollectEnergyTask): string | null
    {
        return task.structureID;
    }
    public static taskAssignCreep(task: CollectEnergyTask, creep: Creep, room: Room)
    {
        task.valueLeft = Math.max(task.valueLeft - creep.store.getFreeCapacity(), 0);

        room.memory.tasks[task.structureID].valueLeft = task.valueLeft;
    }
    public static tempTaskAssignCreep(task: CollectEnergyTask, creep: Creep, room: Room)
    {
        task.valueLeft = Math.max(task.valueLeft - creep.store.getFreeCapacity(), 0);
    }
    public static tempUnassignCreep(task: CollectEnergyTask, creep: Creep, room: Room)
    {
        task.valueLeft -= creep.store.getFreeCapacity();
    }
    public static updateValueLeft(task: CollectEnergyTask, room: Room): void
    {
        let structure: AnyStructure | null = Game.getObjectById(task.structureID);

        if (structure)
        {
            task.valueLeft = structure.store[RESOURCE_ENERGY];
            room.memory.tasks[task.structureID].valueLeft = task.valueLeft;
        }
    }
}


export function createTasks(room: Room): void
{
    const structures: Structure[] = room.find(FIND_STRUCTURES);
    structures.forEach(structure =>
    {
        if (!(structure.id in room.memory.tasks))
        {

            let priority = 0;
            let newTask: Task | null = null;
            switch (structure.structureType)
            {
                case STRUCTURE_CONTAINER:
                    priority = -1;
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
                default:
                    break;
            }
            if (priority > 0)
            {
                if (priority === 11)
                {
                    newTask = new UpgradeControllerTask(structure.id as Id<StructureController>)
                    room.memory.tasks[structure.id] = newTask;
                }
                else
                {
                    console.log("Creating new transport task");
                    newTask = new TransportTask(priority, structure.id as Id<AnyStoreStructure>)
                    console.log("transport task with a value of " + newTask.valueLeft);
                    room.memory.tasks[structure.id] = newTask;
                }
            }
            else
            {
                if (priority === -1)
                {
                    // container as a resource location
                    let collectEnergyTask: CollectEnergyTask = new CollectEnergyTask(structure.id as unknown as Id<AnyStoreStructure>);
                    room.memory.tasks[structure.id] = collectEnergyTask;
                    let sources: Source[] = structure.pos.findInRange(FIND_SOURCES, 1);

                    if (sources.length > 0)
                    {
                        let sourceTask: HarvestTask = room.memory.tasks[sources[0].id] as HarvestTask;
                        sourceTask.containerID = structure.id as unknown as Id<StructureContainer>;
                    }
                }
            }
        }
    });

    const sources: Source[] = room.find(FIND_SOURCES);
    sources.forEach(source =>
    {
        if (!(source.id in room.memory.tasks))
        {
            let newTask = new HarvestTask(source.id);
            room.memory.tasks[source.id] = newTask;
        }
    });

    const constructionSites: ConstructionSite[] = room.find(FIND_CONSTRUCTION_SITES);
    constructionSites.forEach(constructionSite =>
    {
        let newTask = new BuildTask(7, constructionSite.id);
        room.memory.tasks[constructionSite.id] = newTask;
    });
}

export function updatePriorities(room: Room)
{
    let tasks: [string, Task][] = Object.entries(room.memory.tasks);
    tasks.forEach(task =>
    {
        Task.updateValueLeft(task[1], room);
    });
}
