import { TaskMap } from "tasks/Task";
import { DEFAULT_CREEP_MEMORY } from "./CreepMemory";

export class CreepState {
    creep: Creep;
    memory: CreepMemory;

    constructor(creep: Creep, memory: CreepMemory | null) {
        this.creep = creep;
        this.memory = memory || DEFAULT_CREEP_MEMORY;
    }

    public perform(tasks: TaskMap) {
        const task = this.memory.taskId ? tasks.get(this.memory.taskId) : undefined;

        if (task) {
            const nextAction = task.nextAction(this.creep);

            nextAction?.perform(this.creep);
        }
    }
}
