import { World } from "world/World";
import { AnyTask } from "../definitions/Task";
import { TaskManager } from "./TaskManager";
import { updateCreepMemoryForTask } from "creeps/CreepController";
import { CreepState } from "creeps/CreepState";

function isCreepFree(creep: CreepState, taskManager: TaskManager): boolean {
    return creep.memory.taskId === undefined || !taskManager.tasks.has(creep.memory.taskId);
}

type Candidate = {
    creep: CreepState;
    task: AnyTask;
    score: number;
};

export function assignCreeps(world: World) {
    for (const [, worldRoom] of world.rooms) {
        const room = worldRoom.room;

        /* --------------------------------------------
           1️⃣ Gather free creeps
           -------------------------------------------- */

        const freeCreeps = worldRoom.myCreeps.filter(c => !c.creep.spawning && isCreepFree(c, world.taskManager));

        if (freeCreeps.length === 0) continue;

        const tasks = world.taskManager.getTasksForRoom(room);
        if (tasks.length === 0) continue;

        /* --------------------------------------------
           2️⃣ Build all viable pairs
           -------------------------------------------- */

        const candidates: Candidate[] = [];

        for (const creepState of freeCreeps) {
            for (const task of tasks) {
                if (task.isDangerous() && !task.allowsDangerousAssignment()) continue;
                if (!task.canPerformTask(creepState, world)) continue;
                if (!task.canAcceptCreep(creepState, world)) continue;

                const score = task.assignmentScore(creepState);

                candidates.push({ creep: creepState, task, score });
            }
        }

        if (candidates.length === 0) continue;

        /* --------------------------------------------
           3️⃣ Assign greedily by best marginal value
           -------------------------------------------- */

        candidates.sort((a, b) => b.score - a.score);

        const assignedCreeps = new Set<Id<Creep>>();

        for (const { creep: creepState, task } of candidates) {
            if (assignedCreeps.has(creepState.creep.id)) continue;
            if (task.isDangerous() && !task.allowsDangerousAssignment()) continue;
            if (!task.canPerformTask(creepState, world)) continue;
            if (!task.canAcceptCreep(creepState, world)) continue;

            task.assignCreep(creepState, world);
            updateCreepMemoryForTask(creepState, task);

            assignedCreeps.add(creepState.creep.id);
        }
    }
}
