import { Action } from "actions/Action";
import { BootstrapAction } from "actions/BootstrapAction";
import { hasBodyPart } from "creeps/CreepUtils";
import { CreepState } from "creeps/CreepState";
import { ResourceManager } from "rooms/ResourceManager";
import { BootstrapTaskData, TaskSafetyPolicy } from "tasks/core/TaskData";
import { TaskKind } from "tasks/core/TaskKind";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";
import { Task } from "./Task";

export function bootstrapTaskName(targetRoom: string): string {
    return "Bootstrap-" + targetRoom;
}

export function createBootstrapTaskData(targetRoom: string, helperRoom: string): BootstrapTaskData {
    return {
        id: bootstrapTaskName(targetRoom),
        kind: TaskKind.BOOTSTRAP,
        targetRoom,
        ownerRoom: helperRoom,
        assignedCreeps: [],
        safetyPolicy: TaskSafetyPolicy.ALLOW_DANGEROUS_ASSIGNMENT
    };
}

export class BootstrapTask extends Task<BootstrapTaskData> {
    constructor(data: BootstrapTaskData) {
        super(data);
    }

    public override isStillValid(): boolean {
        const room = Game.rooms[this.data.targetRoom];

        // Valid as long as the target room is ours and still settling/bootstrapping
        if (!room?.controller?.my) return true; // can't see it, assume still valid

        const onboarding = room.memory.onboarding;
        if (!onboarding) return true;

        return onboarding.stage !== "established";
    }

    public override canPerformTask(creepState: CreepState, _world: World): boolean {
        return hasBodyPart(creepState.creep, WORK) && hasBodyPart(creepState.creep, CARRY);
    }

    protected override taskIsFull(): boolean {
        return this.data.assignedCreeps.length >= 4;
    }

    public override score(creep: Creep): number {
        const roomBias = creep.memory.ownerRoom === this.data.ownerRoom ? 80 : 0;
        return 400 + roomBias;
    }

    public override nextAction(creepState: CreepState, _resourceManager: ResourceManager): Action | null {
        return new BootstrapAction(this.data.targetRoom, this.data.ownerRoom!);
    }

    public override validCreationSetup(): void {}

    public override requirements(): TaskRequirements {
        return {
            work: { parts: 8, creeps: 4 },
            carry: { parts: 8, creeps: 4 }
        };
    }
}
