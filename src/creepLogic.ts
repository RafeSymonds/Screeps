import { all, min, object } from "lodash";
import * as positionCalculations from "./positionCalculations";

import * as priorities from "./priorities";
import * as binaryPriorityQueue from "./binaryPriorityQueue"


const lessThanComparator: binaryPriorityQueue.LessThanComparator<[number, number]> = (a, b) =>
{

    if (!a || !b)
    {
        console.log("invalid element in PQ");
    }
    return a[1] - b[1];

};

export function assignCreeps(room: Room, roomTasks: { [taskId: string]: priorities.Task }, creeps: Creep[])
{

    if (roomTasks === undefined || Object.keys(roomTasks).length === 0)
    {
        return;
    }



    let allTasks: [string, priorities.Task][] = Object.entries(roomTasks);

    let tasks: [string, priorities.Task][] = [];
    let taskCreeps: binaryPriorityQueue.PriorityQueue<[number, number]>[] = [];
    let creepDistances: number[][] = [];
    let taskIndexForDistances: [number, number][][] = [];

    allTasks.forEach(task =>
    {
        if (task[1].valueLeft > 0)
        {
            tasks.push(task);
            taskCreeps.push(new binaryPriorityQueue.PriorityQueue(lessThanComparator));
        }
    });

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
            if (priorities.Task.checkCreepMatches(tasks[taskIndex][1], creeps[creepIndex], room))
            {
                let taskPosition: RoomPosition | null = priorities.Task.getPosition(tasks[taskIndex][1]);
                if (taskPosition)
                {
                    let distance: number = positionCalculations.distance(taskPosition, creeps[creepIndex].pos) * (tasks[taskIndex][1].priority + 1) / 2
                    creepDistances[creepIndex].push(distance);
                    taskIndexForDistances[creepIndex].push([taskIndexForDistances[creepIndex].length, taskIndex]);
                }
            }
        }
    }

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

    while (freeCount > Math.max(creeps.length - tasks.length, 0))
    {
        let creepIndex: number = 0;
        for (; creepIndex < creeps.length; creepIndex++)
        {
            if (creepFree[creepIndex])
            {
                break;
            }
        }
        if (creepIndex === creeps.length)
        {
            break;
        }
        let possibleTask: boolean = false;
        for (let distanceTaskIndex = 0; distanceTaskIndex < taskIndexForDistances[creepIndex].length; distanceTaskIndex++)
        {
            //console.log("first check");
            let taskIndex = taskIndexForDistances[creepIndex][distanceTaskIndex][1];
            let distanceIndex = taskIndexForDistances[creepIndex][distanceTaskIndex][0];
            if (tasks[taskIndex][1].valueLeft > 0)
            {
                possibleTask = true;
                //console.log("Valid match");
                let distance: number = creepDistances[creepIndex][distanceIndex]
                console.log("chosen distance", distance, "from", creepDistances[creepIndex]);
                let newElement: [number, number] = [creepIndex, distance];
                taskCreeps[taskIndex].push(newElement);
                creepFree[creepIndex] = false;
                freeCount--;
                tempAssignCreepToTask(tasks[taskIndex][1], creeps[creepIndex], room);
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
                    tempAssignCreepToTask(tasks[taskIndex][1], creeps[creepIndex], room);

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

    tasks.forEach(task =>
    {
        priorities.Task.updateMemory(task[1], room);
    });
}

export function assignCreepToTask(task: priorities.Task, creep: Creep, room: Room)
{
    let taskID: string | null = priorities.Task.getID(task);
    if (taskID)
    {
        creep.memory.taskID.push(taskID);

        priorities.Task.taskAssignCreep(task, creep, room);

        creep.memory.workAmountLeft = 0;
    }
}

// does not update memory
export function tempAssignCreepToTask(task: priorities.Task, creep: Creep, room: Room)
{
    let taskID: string | null = priorities.Task.getID(task);
    if (taskID)
    {
        creep.memory.taskID.push(taskID);

        priorities.Task.tempTaskAssignCreep(task, creep, room);

        creep.memory.workAmountLeft = 0;
    }
}

export function unassignTempCreepToTask(task: priorities.Task, creep: Creep, room: Room)
{
    if (task)
    {
        creep.memory.taskID.pop();

        priorities.Task.tempUnassignCreep(task, creep, room);

        creep.memory.workAmountLeft = 1;
    }
}

export function processCreepActions(creep: Creep, task: priorities.Task | null, room: Room)
{
    if (task)
    {
        priorities.Task.action(task, creep, room);
    }
    else
    {
        creep.memory.taskID.pop();
    }
}
