import { TaskInfo, Task, TaskType, WorkType, CreepMatchesTask } from "tasks/abstract_task";

class CollectTaskInfo extends TaskInfo {
    amount: number;

    constructor(amount: number) {
        super();

        this.amount = amount;
    }
}
export class CollectEnergyTask extends Task<CollectTaskInfo> {
    id: Id<AnyStoreStructure | Resource>;
    valueLeft: number;

    constructor(resource: AnyStoreStructure | Resource) {
        super(resource.id, resource!.room!.name, TaskType.collect, WorkType.collectStructure, 3, resource!.pos);

        this.id = resource.id;

        if (resource instanceof Resource) {
            this.valueLeft = resource.amount;
        } else {
            this.valueLeft = resource!.store.getUsedCapacity() as number;
        }
    }

    public assignCreep(creep: Creep) {
        this.valueLeft = Math.max(this.valueLeft - creep.store.getFreeCapacity(), 0);
    }

    protected unassignCreep(creepID: Id<Creep>) {
        let taskInfo = this.creeps.get(creepID);

        this.valueLeft -= taskInfo!.amount;

        let creep = Game.getObjectById(creepID);
        if (!creep) {
            return;
        }
        global.creepAssignedTasks[creepID].workAmountLeft = creep.store.getUsedCapacity();
    }

    public checkCreepMatches(creep: Creep): CreepMatchesTask {
        if (creep.store.getCapacity() > 0 && creep.store[RESOURCE_ENERGY] < creep.store.getCapacity() / 2) {
            return CreepMatchesTask.true;
        }
        return CreepMatchesTask.false;
    }
    public processCreepAction(creep: Creep) {
        let object: AnyStoreStructure | Resource | null = Game.getObjectById(this.id);

        if (!object) {
            this.deleteTask();
            return;
        }

        if (creep.store.getFreeCapacity() > 0) {
            if (object instanceof Resource) {
                if (creep.pickup(object) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(object);
                }
            } else {
                if (object!.store.getUsedCapacity() == 0) {
                    this.removeAllCreeps();
                    return;
                }

                let enegyToTransfer = Math.min(
                    creep.store.getFreeCapacity(),
                    object!.store.getUsedCapacity() as number
                );
                if (creep.withdraw(object, RESOURCE_ENERGY, enegyToTransfer) === ERR_NOT_IN_RANGE) {
                    creep.moveTo(object);
                }
            }
        } else {
            this.unassignCreep(creep.name);
        }
    }
    public updateValueLeft() {
        let object: AnyStoreStructure | Resource | null = Game.getObjectById(this.id);
        if (object instanceof Resource) {
            this.valueLeft = object.amount;
        } else {
            this.valueLeft = object!.store.getUsedCapacity() as number;
        }
        this.creeps.forEach((_, creepID) => {
            let creep = Game.getObjectById(creepID);

            if (creep) {
                this.valueLeft -= creep.store.getUsedCapacity();
            } else {
                this.removeCreep(creepID);
            }
        });

        this.valueLeft = Math.max(this.valueLeft, 0);
    }

    public hasValueLeft(): boolean {
        return this.valueLeft > 0;
    }
}
