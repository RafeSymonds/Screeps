import { DEFAULT_CREEP_MEMORY } from "./CreepMemory";

export class CreepState {
    creep: Creep;
    memory: CreepMemory;

    constructor(creep: Creep, memory: CreepMemory | null) {
        this.creep = creep;
        this.memory = memory || DEFAULT_CREEP_MEMORY;
    }
}
