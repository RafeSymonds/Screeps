import { all, min, object } from "lodash";
import * as positionCalculations from "./positionCalculations";

import * as binaryPriorityQueue from "./binaryPriorityQueue"

import * as GeneralTask from "./Tasks/generalTask"
import { BuildTask } from "Tasks/buildTask";
import { CollectDroppedResource } from "Tasks/collectDroppedResource";
import { CollectEnergyTask } from "Tasks/collectEnergyTask";
import { DropResourceTask } from "Tasks/dropResourceTask";
import { HarvestTask } from "Tasks/harvestTask";
import { TransportTask } from "Tasks/transportTask";
import { UpgradeControllerTask } from "Tasks/upgradeControllerTask";
import { createPrivateKey, privateEncrypt } from "crypto";

const lessThanComparator: binaryPriorityQueue.LessThanComparator<[number, number]> = (a, b) =>
{
    if (!a || !b)
    {
        console.log("invalid element in PQ");
    }
    return a[1] - b[1];

};

export function assignCreeps(room: Room, roomTasks: { [taskId: string]: GeneralTask.Task }, creeps: Creep[])
{

    let allTasks: [string, GeneralTask.Task][] = Object.entries(roomTasks);
    if (roomTasks === undefined || allTasks.length === 0)
    {
        return;
    }

    let tasks: [string, GeneralTask.Task][] = [];
    let taskCreeps: binaryPriorityQueue.PriorityQueue<[number, number]>[] = [];
    let creepDistances: number[][] = [];
    let taskIndexForDistances: [number, number][][] = [];

    allTasks.forEach(task =>
    {
        if (task[1].hasValueLeft())
        {
            tasks.push(task);
            taskCreeps.push(new binaryPriorityQueue.PriorityQueue(lessThanComparator));
        }
    });

    console.log(creeps);
    console.log(tasks);

    if (creeps.length === 0 || tasks.length === 0)
    {
        return;
    }

    for (let creepIndex = 0; creepIndex < creeps.length; creepIndex++)
    {
        creepDistances.push([]);
        taskIndexForDistances.push([]);
        for (let taskIndex = 0; taskIndex < tasks.length; taskIndex++)
        {
            if (tasks[taskIndex][1].checkCreepMatches(creeps[creepIndex]))
            {
                let taskPosition: RoomPosition | null = tasks[taskIndex][1].getPosition();

                if (taskPosition)
                {
                    let distance: number = positionCalculations.distance(taskPosition, creeps[creepIndex].pos) * (tasks[taskIndex][1].priority + 1) / 2
                    creepDistances[creepIndex].push(distance);

                    taskIndexForDistances[creepIndex].push([taskIndexForDistances[creepIndex].length, taskIndex]);

                }
            }
        }
    }

    console.log(creepDistances, taskIndexForDistances);

    let freeCount: number = creeps.length;
    let creepFree: boolean[] = Array.from({ length: creeps.length }, () => true);

    for (let creepIndex = 0; creepIndex < creeps.length; creepIndex++)
    {
        if (taskIndexForDistances[creepIndex].length === 0)
        {
            freeCount--;
            creepFree[creepIndex] = false;
        }
        else
        {
            taskIndexForDistances[creepIndex].sort((a, b) => creepDistances[creepIndex][a[0]] - creepDistances[creepIndex][b[0]]);
        }
    }

    while (freeCount > 0)
    {
        console.log("Free creep cout: ", freeCount);
        let creepIndex: number = 0;
        for (; creepIndex < creeps.length; creepIndex++)
        {
            if (creeps[creepIndex].memory.workAmountLeft > 0)
            {
                break;
            }
        }
        if (creepIndex === creeps.length)
        {
            break;
        }

        console.log("starting to find best task", taskIndexForDistances[creepIndex]);

        let possibleTask: boolean = false;
        for (let distanceTaskIndex = 0; distanceTaskIndex < taskIndexForDistances[creepIndex].length; distanceTaskIndex++)
        {
            //console.log("first check");
            let taskIndex = taskIndexForDistances[creepIndex][distanceTaskIndex][1];
            let distanceIndex = taskIndexForDistances[creepIndex][distanceTaskIndex][0];

            console.log(tasks[taskIndex][1].getID());

            if (tasks[taskIndex][1].hasValueLeft())
            {
                possibleTask = true;
                //console.log("Valid match");
                let distance: number = creepDistances[creepIndex][distanceIndex]
                //console.log("chosen distance", distance, "from", creepDistances[creepIndex]);
                let newElement: [number, number] = [creepIndex, distance];
                if (newElement)
                {
                    taskCreeps[taskIndex].push(newElement);
                    creepFree[creepIndex] = false;
                    freeCount--;
                    assignCreepToTask(tasks[taskIndex][1], creeps[creepIndex], room);
                }
                break;
            }
            else
            {
                let otherCreepIndexDistance: [number, number] = taskCreeps[taskIndex].top();
                let distance: number = creepDistances[creepIndex][distanceIndex]
                if (distance < otherCreepIndexDistance[1])
                {
                    possibleTask = true;
                    unassignTempCreepToTask(tasks[taskIndex][1], creeps[otherCreepIndexDistance[0]], room);
                    assignCreepToTask(tasks[taskIndex][1], creeps[creepIndex], room);

                    taskCreeps[taskIndex].pop();
                    creepFree[otherCreepIndexDistance[0]] = true;

                    taskCreeps[taskIndex].push([creepIndex, distance]);
                    creepFree[creepIndex] = false;
                    break;
                }
            }
        }
        if (!possibleTask)
        {
            creepFree[creepIndex] = false;
            freeCount--;
        }
    }
}

export function assignCreepToTask(task: GeneralTask.Task, creep: Creep, room: Room)
{
    console.log("Assigning creep to task");
    let taskID: string | null = task.getID();
    if (taskID)
    {
        creep.memory.taskID.push(taskID);

        task.taskAssignCreep(creep.name);

        creep.memory.workAmountLeft = 0;
    }
}

export function unassignTempCreepToTask(task: GeneralTask.Task, creep: Creep, room: Room)
{
    console.log("unassigning creep to task");
    if (task)
    {
        task.unassignCreep(creep.name);

        creep.memory.workAmountLeft = 1;
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
            let newTask: GeneralTask.Task | null = null;
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
                    global.roomMemory[room.name].tasks[structure.id] = newTask as GeneralTask.Task;
                }
                else
                {
                    console.log("Creating new transport task");
                    newTask = new TransportTask(structure.id as Id<AnyStoreStructure>, priority)
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
            let newTask = new BuildTask(constructionSite.id, 6);
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
