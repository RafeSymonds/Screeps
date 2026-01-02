import { getDefaultCreepMemory } from "./CreepMemory";

export class CreepState {
    creep: Creep;
    memory: CreepMemory;
    moved: boolean;

    constructor(creep: Creep, memory: CreepMemory | null) {
        this.creep = creep;
        this.memory = memory || getDefaultCreepMemory(creep.room.name);
        this.moved = false;
    }
}

export function clearCreepTask(creepState: CreepState) {
    creepState.memory.taskId = undefined;
}
