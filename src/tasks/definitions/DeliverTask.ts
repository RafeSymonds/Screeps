import { TaskKind } from "../core/TaskKind";
import { DeliverTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { TransferAction } from "actions/TransferAction";
import { DropAction } from "actions/DropAction";
import { CreepState } from "creeps/CreepState";
import { findBestEnergyTask } from "../requirements/EnergyRequirement";
import { hasBodyPart } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { creepNeedsEnergy } from "creeps/CreepController";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";

type DeliverTaskTarget = AnyStoreStructure | RoomPosition;

function isStructureTarget(target: DeliverTaskTarget): target is AnyStoreStructure {
    return "structureType" in target;
}

function positionSignature(pos: RoomPosition): string {
    return `${pos.roomName}-${pos.x}-${pos.y}`;
}

export function deliverTaskName(target: DeliverTaskTarget): string {
    if (isStructureTarget(target)) {
        return `Transfer-${target.pos.roomName}-${target.id}`;
    }

    return `Transfer-${positionSignature(target)}`;
}

export function createDeliverTaskData(target: DeliverTaskTarget): DeliverTaskData {
    if (isStructureTarget(target)) {
        return {
            id: deliverTaskName(target),
            kind: TaskKind.DELIVER,
            targetRoom: target.pos.roomName,
            assignedCreeps: [],
            target: {
                kind: "structure",
                structureId: target.id
            }
        };
    }

    const position = new RoomPosition(target.x, target.y, target.roomName);

    return {
        id: deliverTaskName(target),
        kind: TaskKind.DELIVER,
        targetRoom: target.roomName,
        assignedCreeps: [],
        target: {
            kind: "position",
            position
        }
    };
}

export class DeliverTask extends Task<DeliverTaskData> {
    target: AnyStoreStructure | RoomPosition | null;

    constructor(data: DeliverTaskData) {
        super(data);
        this.data = data;

        if (data.target.kind === "structure") {
            this.target = Game.getObjectById(data.target.structureId);
        } else {
            const pos = data.target.position;
            this.target = new RoomPosition(pos.x, pos.y, pos.roomName);
        }
    }

    public override isStillValid(): boolean {
        return this.target !== null;
    }

    public canPerformTask(creepState: CreepState, world: World): boolean {
        return (
            hasBodyPart(creepState.creep, CARRY) &&
            world.resourceManager.roomHasEnoughEnergy(creepState, creepState.creep.room.name)
        );
    }

    public taskIsFull(): boolean {
        if (this.target === null) {
            return true;
        }

        if (this.target instanceof Structure) {
            return this.target.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
        }

        return false;
    }

    public override score(creep: Creep): number {
        if (!this.target) {
            return -Infinity;
        }

        return -100 - creep.pos.getRangeTo(this.target) + this.priority() * 5;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager): Action | null {
        if (
            !this.target ||
            (this.target instanceof Structure && this.target.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
        ) {
            console.log("clearing trafer task", this.id());
            creepState.memory.taskId = undefined;
            return null;
        }

        // TODO: change this to function to determine if we have energy or not
        // TODO: change to be smarter. near by energy grab otherwise build
        if (creepNeedsEnergy(creepState)) {
            const destination = this.target instanceof Structure ? this.target : null;
            return findBestEnergyTask(creepState, destination, resourceManager);
        }

        if (this.target instanceof Structure) {
            return new TransferAction(this.target);
        }

        return new DropAction(this.target);
    }

    public override validCreationSetup(): void {}

    public requirements(): TaskRequirements {
        const energyPerTick = 5;

        const distance = 8;
        const roundTrip = distance * 2;

        return {
            carry: {
                parts: Math.ceil((energyPerTick * roundTrip) / 50)
            }
        };
    }

    private priority(): number {
        const structure = this.target instanceof Structure ? this.target : null;
        if (!structure) {
            return -10;
        }

        switch (structure.structureType) {
            case STRUCTURE_SPAWN:
                return 10; // game cannot progress without this

            case STRUCTURE_EXTENSION:
                return 9; // spawn throughput

            case STRUCTURE_TOWER:
                return 8; // defense > economy when empty

            case STRUCTURE_CONTAINER:
                return 4; // local buffer, lower than consumers

            case STRUCTURE_STORAGE:
                return 2; // global buffer, lowest urgency

            default:
                return 0;
        }
    }
}
