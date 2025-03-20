import { TaskInfo, Task, TaskType, WorkType, CreepMatchesTask } from "tasks/abstract_task";

export class HarvestTaskInfo extends TaskInfo {
    workerParts: number;

    constructor(workerParts: number) {
        super();

        this.workerParts = workerParts;
    }
}

export class HarvestTask extends Task<HarvestTaskInfo> {
    source_id: Id<Source>;
    maxHarvestSpots: number = 8;
    harvestSpotsLeft: number;
    workerPartsLeft: number;

    containerID: Id<StructureContainer> | null;

    constructor(source: Source, containerID: Id<StructureContainer> | null = null) {
        super(source.id, source.room.name, TaskType.harvest, WorkType.harvest, 10, source.pos);

        this.source_id = source!.id;
        this.workerPartsLeft = 5;
        this.containerID = containerID;

        this.harvestSpotsLeft = this.maxHarvestSpots;
    }

    protected unassignCreep(creepID: Id<Creep>) {
        this.harvestSpotsLeft += 1;

        let taskInfo = this.creeps.get(creepID);

        this.workerPartsLeft += taskInfo!.workerParts;

        let creep = Game.getObjectById(creepID);
        if (!creep) {
            return;
        }
        global.creepAssignedTasks[creepID].workAmountLeft = creep.store.getUsedCapacity();
    }

    public assignCreep(creep: Creep) {
        let workParts = creep.getActiveBodyparts(WORK);
        super.addCreep(creep.id, new HarvestTaskInfo(workParts));

        this.harvestSpotsLeft -= 1;
        this.workerPartsLeft -= workParts;
    }

    public checkCreepMatches(creep: Creep): CreepMatchesTask {
        if (creep.memory.role === TaskType.harvest) {
            return CreepMatchesTask.true;
        }

        if (creep.memory.role === TaskType.work && creep.store.getUsedCapacity() < creep.store.getCapacity() / 2) {
            return CreepMatchesTask.true;
        }
        return CreepMatchesTask.false;
    }
    public processCreepAction(creep: Creep) {
        let source: Source | null = Game.getObjectById(this.source_id);

        if (!source) {
            this.deleteTask();
            return;
        }

        if (creep.store.getFreeCapacity() == 0) {
            this.removeCreep(creep.id);
        } else if (this.containerID) {
            let container: StructureContainer | null = Game.getObjectById(this.containerID);

            if (container) {
                if (container.pos.isEqualTo(creep.pos)) {
                    creep.harvest(source);
                } else {
                    creep.moveTo(container);
                }
            } else {
                this.containerID = null;
            }
        } else {
            let harvestErroCode = creep.harvest(source);

            if (harvestErroCode === ERR_NOT_IN_RANGE) {
                creep.moveTo(source);
            } else if (harvestErroCode === OK) {
                let objects: LookAtResult[] = source.room.lookAt(creep.pos);

                objects.forEach(object => {
                    // if (object.type == LOOK_ENERGY) {
                    //     let energyLocations = global.roomMemory[source!.room.name].energyLocations;
                    //
                    //     if (object!.energy!.id in energyLocations) {
                    //         energyLocations[object!.energy!.id].updateValueLeft();
                    //     } else {
                    //         energyLocations[object!.energy!.id] = new CollectDroppedResource(object!.energy!.id);
                    //     }
                    // }
                });
            }
        }
    }

    public updateValueLeft() {
        this.workerPartsLeft = 5;
        this.creeps.forEach((_, creepID) => {
            let creep = Game.getObjectById(creepID);

            if (creep !== null) {
                this.assignCreep(creep);
            } else {
                super.deleteCreep(creepID);
            }
        });
        this.harvestSpotsLeft = this.maxHarvestSpots - super.numCreepsAssigned();
    }

    public hasValueLeft(): boolean {
        return this.harvestSpotsLeft > 0 && this.workerPartsLeft > 0;
    }
}
