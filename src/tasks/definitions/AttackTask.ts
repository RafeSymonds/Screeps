import { Action } from "actions/Action";
import { AttackAction } from "actions/AttackAction";
import { countCombatParts, hasCombatPart } from "creeps/CreepUtils";
import { CreepState } from "creeps/CreepState";
import { ResourceManager } from "rooms/ResourceManager";
import { AttackTaskData, TaskSafetyPolicy } from "tasks/core/TaskData";
import { TaskKind } from "tasks/core/TaskKind";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";
import { Task } from "./Task";

export function attackTaskName(targetRoom: string): string {
    return "Attack-" + targetRoom;
}

export function createAttackTaskData(targetRoom: string, ownerRoom: string, squadSize: number): AttackTaskData {
    return {
        id: attackTaskName(targetRoom),
        kind: TaskKind.ATTACK,
        targetRoom,
        ownerRoom,
        squadSize,
        assignedCreeps: [],
        safetyPolicy: TaskSafetyPolicy.ALLOW_DANGEROUS_ASSIGNMENT
    };
}

export class AttackTask extends Task<AttackTaskData> {
    constructor(data: AttackTaskData) {
        super(data);
    }

    public override isStillValid(): boolean {
        const ownerRoom = Game.rooms[this.data.ownerRoom];
        if (!ownerRoom?.controller?.my) return false;

        // Valid as long as the attack target is still set
        return ownerRoom.memory.attackTarget === this.data.targetRoom;
    }

    public override canPerformTask(creepState: CreepState, _world: World): boolean {
        return hasCombatPart(creepState.creep);
    }

    protected override taskIsFull(): boolean {
        return this.data.assignedCreeps.length >= this.data.squadSize;
    }

    public override score(creep: Creep): number {
        const roomBias = creep.memory.ownerRoom === this.data.ownerRoom ? 50 : 0;
        return 300 + roomBias + countCombatParts(creep) * 15;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager, world: World): Action | null {
        return new AttackAction(this.data.targetRoom, this.data.assignedCreeps, this.data.squadSize);
    }

    public override validCreationSetup(): void {}

    public override requirements(): TaskRequirements {
        return {
            combat: {
                parts: this.data.squadSize * 4,
                creeps: this.data.squadSize
            }
        };
    }
}
