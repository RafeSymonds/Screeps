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
import { createPrivateKey, generateKeyPair, privateEncrypt } from "crypto";

const lessThanComparator: binaryPriorityQueue.LessThanComparator<[number, number]> = (a, b) =>
{
    if (!a || !b)
    {
        console.log("invalid element in PQ");
    }
    return a[1] - b[1];

};

function findClosestResourceTowardsTask(creep: Creep, allResourceLocations: [string, GeneralTask.Task][], goalTask: GeneralTask.Task): [number, number]
{
    let minDistance: number = Infinity;
    let bestTaskIndex: number = 0;

    for (let resourceIndex = 0; resourceIndex < allResourceLocations.length; resourceIndex++)
    {
        let distance: number =
            positionCalculations.distance(creep.pos, allResourceLocations[resourceIndex][1].getPosition())
            + positionCalculations.distance(allResourceLocations[resourceIndex][1].getPosition(), goalTask.getPosition())

        if (distance < minDistance)
        {
            minDistance = distance;
            bestTaskIndex = resourceIndex;
        }
    };
    return [bestTaskIndex, minDistance];
}

export function assignCreeps(
    room: Room,
    roomTasks: { [taskID: string]: GeneralTask.Task },
    creeps: Creep[],
    roomResourceLocations: { [taskID: string]: GeneralTask.Task })
{
    console.log("assignCreeps()", creeps.length);
    if (creeps.length === 0)
    {
        return;
    }

    let validTasks: [GeneralTask.Task, binaryPriorityQueue.PriorityQueue<[number, number]>][] = []

    Object.entries(roomTasks).forEach(([taskID, task]) =>
    {
        if (task.hasValueLeft())
        {
            validTasks.push([task, new binaryPriorityQueue.PriorityQueue(lessThanComparator)]);
        }
    });

    let resourceLocations: [string, GeneralTask.Task][] = Object.entries(roomResourceLocations);


    console.log("valid tasks", validTasks);
    console.log("resource locations", resourceLocations);


    // resourceIndex, taskIndex
    let creepTaskInfos: number[][] = []
    let currentCreepPositions: RoomPosition[] = []

    for (let creepIndex = 0; creepIndex < creeps.length; creepIndex++)
    {
        let numTasks: number = creeps[creepIndex].memory.taskID.length;
        if (numTasks > 0)
        {
            let lastTask = global.roomMemory[room.name].tasks[creeps[creepIndex].memory.taskID[numTasks - 1]];
            currentCreepPositions[creepIndex] = lastTask.getPosition();
        }
        else
        {
            currentCreepPositions[creepIndex] = creeps[creepIndex].pos;
        }


        creepTaskInfos.push([]);

        for (let taskIndex = 0; taskIndex < validTasks.length; taskIndex++)
        {
            let creepMatches: GeneralTask.CreepMatchesTask = validTasks[taskIndex][0].checkCreepMatches(creeps[creepIndex]);
            if (creepMatches === GeneralTask.CreepMatchesTask.true)
            {
                let taskPosition: RoomPosition = validTasks[taskIndex][0].getPosition();



                creepTaskInfos[creepIndex].push(taskIndex);
            }
            else if (creepMatches == GeneralTask.CreepMatchesTask.needResources)
            {
                if (resourceLocations.length == 0)
                {
                    continue;
                }

                creepTaskInfos[creepIndex].push(taskIndex);
            }
        }
    }

    for (let creepIndex = 0; creepIndex < creeps.length; creepIndex++)
    {
        console.log(creeps[creepIndex].name, creepTaskInfos[creepIndex]);
    }

    let noBetterMatches: boolean = false;

    do
    {
        let creepIndex: number = 0;

        for (; creepIndex < creeps.length; creepIndex++)
        {
            if (creeps[creepIndex].memory.workAmountLeft > 0 || creeps[creepIndex].memory.taskID.length == 0)
            {
                break;
            }
        }
        if (creepIndex === creeps.length)
        {
            break;
        }


        let creepTaskInfo: number[] = creepTaskInfos[creepIndex];

        let possibleTask: boolean = false;

        for (let distanceTaskIndex = 0; distanceTaskIndex < creepTaskInfos[creepIndex].length; distanceTaskIndex++)
        {

            let taskIndex: number = creepTaskInfo[distanceTaskIndex]
                ;
            let creepMatches: GeneralTask.CreepMatchesTask = validTasks[taskIndex][0].checkCreepMatches(creeps[creepIndex]);




            let resourceIndex: number = -1;
            let distance: number;
            if (creepMatches == GeneralTask.CreepMatchesTask.needResources)
            {
                let [bestTaskIndex, minDistance] = findClosestResourceTowardsTask(creeps[creepIndex], resourceLocations, validTasks[taskIndex][0]);

                resourceIndex = bestTaskIndex;
                distance = minDistance;
            }
            else
            {
                distance = positionCalculations.distance(creeps[creepIndex].pos, validTasks[taskIndex][0].getPosition());
            }

            if (resourceIndex != -1 && !resourceLocations[resourceIndex][1].hasValueLeft())
            {
                continue;
            }

            if (validTasks[taskIndex][0].hasValueLeft())
            {
                possibleTask = true;

                let newElement: [number, number] = [creepIndex, distance];
                if (newElement)
                {
                    validTasks[taskIndex][1].push(newElement);

                    if (resourceIndex != -1)
                    {
                        // valid resource task
                        assignCreepToTask(creeps[creepIndex], resourceLocations[resourceIndex][1], validTasks[taskIndex][0], room);
                    }
                    else
                    {
                        assignCreepToTask(creeps[creepIndex], null, validTasks[taskIndex][0], room);
                    }
                    currentCreepPositions[creepIndex] = validTasks[taskIndex][0].getPosition();
                }
                break;
            }
            else
            {
                console.log(validTasks[taskIndex][1].top());

                let [otherCreepIndex, otherCreepDistance] = validTasks[taskIndex][1].top();

                if (distance < otherCreepDistance)
                {
                    console.log("Replacing creep on task");

                    possibleTask = true;

                    validTasks[taskIndex][1].pop();
                    validTasks[taskIndex][1].push([creepIndex, distance]);

                    if (resourceIndex != -1)
                    {
                        // valid resource task
                        unassignTempCreepToTask(creeps[otherCreepIndex], resourceLocations[resourceIndex][1], validTasks[taskIndex][0], room);
                        assignCreepToTask(creeps[creepIndex], resourceLocations[resourceIndex][1], validTasks[taskIndex][0], room);


                        creeps[otherCreepIndex].memory.taskID.pop();

                    }
                    else
                    {
                        unassignTempCreepToTask(creeps[otherCreepIndex], null, validTasks[taskIndex][0], room);
                        assignCreepToTask(creeps[creepIndex], null, validTasks[taskIndex][0], room);
                    }
                    currentCreepPositions[creepIndex] = validTasks[taskIndex][0].getPosition();



                    break;
                }
            }
        }

        if (possibleTask)
        {
            noBetterMatches = true;
        }
    }
    while (noBetterMatches)
    {

    }

}

export function assignCreepToTask(creep: Creep, resourceTask: GeneralTask.Task | null, task: GeneralTask.Task, room: Room)
{
    if (resourceTask)
    {
        resourceTask.taskAssignCreep(creep.name);
    }
    task.taskAssignCreep(creep.name);
}

export function unassignTempCreepToTask(creep: Creep, resourceTask: GeneralTask.Task | null, task: GeneralTask.Task, room: Room)
{
    if (resourceTask)
    {
        resourceTask.unassignCreep(creep.name);
    }
    task.unassignCreep(creep.name);
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
