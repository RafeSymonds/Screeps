class CreepState {
    creep: Creep;
    memory: CreepMemory;

    constructor(creep: Creep, memory: CreepMemory | undefined) {
        this.creep = creep;
        this.memory = memory || DEFAULT_CREEP_MEMORY;
    }
}
