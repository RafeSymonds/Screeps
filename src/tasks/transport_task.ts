import { TaskInfo, Task, TaskType, WorkType, CreepMatchesTask } from "tasks/abstract_task";

export class TransportTaskInfo extends TaskInfo {
    amount: number;

    constructor(amount: number) {
        super();
        this.amount = amount;
    }
}
export class TransportTask extends Task<TransportTaskInfo> {
    id: Id<AnyStoreStructure>;

    valueLeft: number;

    constructor(structure: AnyStoreStructure, priority: number) {
        super(structure.id, structure.room.name, TaskType.transport, WorkType.none, priority, structure!.pos);

        this.id = structure.id;

        this.valueLeft = this.getResourceAmount(structure);
        console.log("transport task value start", this.valueLeft);
    }

    public assignCreep(creep: Creep) {
        let value = creep.store.getUsedCapacity() as number;

        super.addCreep(creep.id, new TransportTaskInfo(value));

        global.creepAssignedTasks[creep.id].workAmountLeft -= value;

        this.valueLeft -= value;
    }

    protected unassignCreep(creepID: Id<Creep>) {
        let taskInfo = this.creeps.get(creepID);
        this.valueLeft += taskInfo!.amount;
        global.creepAssignedTasks[creepID].workAmountLeft += taskInfo!.amount;
    }

    public checkCreepMatches(creep: Creep): CreepMatchesTask {
        if (
            global.creepAssignedTasks[creep.id].workAmountLeft >= creep.store.getCapacity() / 2 ||
            global.creepAssignedTasks[creep.id].workAmountLeft >= this.valueLeft
        ) {
            return CreepMatchesTask.true;
        }

        return CreepMatchesTask.false;
    }

    public processCreepAction(creep: Creep) {
        let structure: AnyStoreStructure | null = Game.getObjectById(this.id);

        if (!structure) {
            this.deleteTask();
            return;
        }

        if (creep.store.getUsedCapacity() > 0 && structure.store.getFreeCapacity() !== 0) {
            let enegyToTransfer = Math.min(creep.store[RESOURCE_ENERGY], this.getResourceAmount(structure));

            if (creep.transfer(structure, RESOURCE_ENERGY, enegyToTransfer) === ERR_NOT_IN_RANGE) {
                creep.moveTo(structure);
            }
        } else {
            global.creepAssignedTasks[creep.id].workAmountLeft = 0;
            this.removeCreep(creep.id);
        }
    }
    public hasValueLeft(): boolean {
        return this.valueLeft > 0;
    }

    public updateValueLeft() {
        let structure: AnyStoreStructure | null = Game.getObjectById(this.id);
        if (!structure) {
            return;
        }

        this.valueLeft = this.getResourceAmount(structure);

        this.creeps.forEach((_, creepID) => {
            let creep: Creep | null = Game.getObjectById(creepID);

            if (creep) {
                this.valueLeft -= creep.store.getUsedCapacity();
            }
        });
        console.log("******************* updating transport task", this.valueLeft);
    }

    public getResourceAmount(structure: AnyStoreStructure): number {
        let resourceValue: number | null = structure.store.getFreeCapacity();
        if (resourceValue) {
            return resourceValue;
        } else {
            return structure.store.getFreeCapacity(RESOURCE_ENERGY);
        }
    }
}
