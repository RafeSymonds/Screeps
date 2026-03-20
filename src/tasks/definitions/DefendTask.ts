import { Action } from "actions/Action";
import { CombatAction } from "actions/CombatAction";
import { countCombatParts, hasCombatPart } from "creeps/CreepUtils";
import { requestedCombatParts, requestedDefenders } from "combat/CombatUtils";
import { CreepState } from "creeps/CreepState";
import { ResourceManager } from "rooms/ResourceManager";
import { DefendTaskData, TaskSafetyPolicy } from "tasks/core/TaskData";
import { TaskKind } from "tasks/core/TaskKind";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";
import { Task } from "./Task";

export function defendTaskName(roomName: string): string {
    return "Defend-" + roomName;
}

export function createDefendTaskData(room: Room): DefendTaskData {
    return {
        id: defendTaskName(room.name),
        kind: TaskKind.DEFEND,
        targetRoom: room.name,
        ownerRoom: room.name,
        assignedCreeps: [],
        safetyPolicy: TaskSafetyPolicy.ALLOW_DANGEROUS_ASSIGNMENT
    };
}

export class DefendTask extends Task<DefendTaskData> {
    constructor(data: DefendTaskData) {
        super(data);
    }

    private hostiles(): Creep[] {
        return Game.rooms[this.data.targetRoom]?.find(FIND_HOSTILE_CREEPS) ?? [];
    }

    private liveAssignedCombatParts(): number {
        return this.data.assignedCreeps.reduce((total, [id]) => {
            const creep = Game.getObjectById(id);
            return total + (creep ? countCombatParts(creep) : 0);
        }, 0);
    }

    private desiredDefenders(): number {
        return requestedDefenders(this.hostiles());
    }

    public override isStillValid(): boolean {
        const room = Game.rooms[this.data.targetRoom];
        return room?.controller?.my === true && room.find(FIND_HOSTILE_CREEPS).length > 0;
    }

    public override canPerformTask(creepState: CreepState, _world: World): boolean {
        return hasCombatPart(creepState.creep);
    }

    protected override taskIsFull(): boolean {
        const hostiles = this.hostiles();
        if (hostiles.length === 0) {
            return true;
        }

        return (
            this.data.assignedCreeps.length >= this.desiredDefenders() &&
            this.liveAssignedCombatParts() >= requestedCombatParts(hostiles)
        );
    }

    public override score(creep: Creep): number {
        const room = Game.rooms[this.data.targetRoom];
        const nearest = room ? creep.pos.findClosestByRange(room.find(FIND_HOSTILE_CREEPS)) : null;
        const roomBias = creep.memory.ownerRoom === this.data.targetRoom ? 100 : 0;
        const rangeBias = nearest ? -creep.pos.getRangeTo(nearest) : 0;

        return 500 + roomBias + rangeBias + countCombatParts(creep) * 20;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager, world: World): Action | null {
        return new CombatAction(this.data.targetRoom, this.data.assignedCreeps, this.desiredDefenders());
    }

    public override validCreationSetup(): void {}

    public override requirements(): TaskRequirements {
        const hostiles = this.hostiles();

        return {
            combat: {
                parts: requestedCombatParts(hostiles),
                creeps: this.desiredDefenders()
            }
        };
    }
}
