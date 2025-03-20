import { TaskInfo, Task, TaskType, WorkType, CreepMatchesTask } from "tasks/abstract_task";

export class UpgradeControllerInfo extends TaskInfo {
    constructor() {
        super();
    }
}

export class UpgradeControllerTask extends Task<UpgradeControllerInfo> {
    id: Id<StructureController>;

    constructor(controller: StructureController) {
        super(controller.id, controller.room.name, TaskType.work, WorkType.upgradeController, 30, controller!.pos);

        this.id = controller.id;
    }

    public assignCreep(creep: Creep) {
        super.addCreep(creep.id, new UpgradeControllerInfo());
    }

    protected unassignCreep(creepID: Id<Creep>) {}

    public checkCreepMatches(creep: Creep): CreepMatchesTask {
        if (creep.memory.role !== TaskType.work) {
            return CreepMatchesTask.false;
        }
        if (
            creep.store.getCapacity() > 0 &&
            creep.memory.role === TaskType.work &&
            creep.store[RESOURCE_ENERGY] >= creep.store.getCapacity() / 2
        ) {
            return CreepMatchesTask.true;
        }
        return CreepMatchesTask.needResources;
    }

    public processCreepAction(creep: Creep) {
        let controller: StructureController | null = Game.getObjectById(this.id);

        if (!controller) {
            this.deleteTask();
            return;
        }

        if (creep && creep.store[RESOURCE_ENERGY] > 0) {
            if (creep.upgradeController(controller) === ERR_NOT_IN_RANGE) {
                creep.moveTo(controller);
            }
        } else {
            global.creepAssignedTasks[creep.id].workAmountLeft = 0;
            this.removeCreep(creep.id);
        }
    }

    public updateValueLeft() {}

    public hasValueLeft(): boolean {
        return true;
    }
}
