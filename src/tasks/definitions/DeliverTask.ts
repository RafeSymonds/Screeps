import { TaskKind } from "../core/TaskKind";
import { DeliverTaskData } from "../core/TaskData";
import { Task } from "./Task";
import { Action } from "actions/Action";
import { TransferAction } from "actions/TransferAction";
import { DropAction } from "actions/DropAction";
import { CreepState } from "creeps/CreepState";
import { findBestEnergyTask } from "../requirements/EnergyRequirement";
import { creepEnergy, hasBodyPart, isDedicatedHaulerCreep, isWorkerCreep } from "creeps/CreepUtils";
import { ResourceManager } from "rooms/ResourceManager";
import { creepNeedsEnergy, creepStoreFullPercentage } from "creeps/CreepController";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { World } from "world/World";
import { scaledRoleBias } from "tasks/core/RoleAffinity";

/* ============================================================
   TYPES
   ============================================================ */

type DeliverTaskTarget = AnyStoreStructure | RoomPosition;

function isStructureTarget(target: DeliverTaskTarget): target is AnyStoreStructure {
    return "structureType" in target;
}

function positionSignature(pos: RoomPosition): string {
    return `${pos.roomName}-${pos.x}-${pos.y}`;
}

/* ============================================================
   TASK DATA CREATION
   ============================================================ */

export function deliverTaskName(target: DeliverTaskTarget): string {
    if (isStructureTarget(target)) {
        return `Transfer-${target.pos.roomName}-${target.id}`;
    }

    return `Transfer-${positionSignature(target)}`;
}

export function createDeliverTaskData(
    target: DeliverTaskTarget,
    distance?: number,
    energyPerTick?: number
): DeliverTaskData {
    if (isStructureTarget(target)) {
        return {
            id: deliverTaskName(target),
            kind: TaskKind.DELIVER,
            targetRoom: target.pos.roomName,
            assignedCreeps: [],
            target: {
                kind: "structure",
                structureId: target.id
            },
            distance,
            energyPerTick
        };
    }

    const pos = new RoomPosition(target.x, target.y, target.roomName);

    return {
        id: deliverTaskName(target),
        kind: TaskKind.DELIVER,
        targetRoom: target.roomName,
        assignedCreeps: [],
        target: {
            kind: "position",
            position: pos
        },
        distance,
        energyPerTick
    };
}

/* ============================================================
   DELIVER TASK
   ============================================================ */

export class DeliverTask extends Task<DeliverTaskData> {
    target: DeliverTaskTarget | null;

    /** Total energy reserved to be delivered */
    private reservedEnergy = 0;

    /** Per-creep reservation so we can release cleanly */
    private reservedBy = new Map<Id<Creep>, number>();

    constructor(data: DeliverTaskData) {
        super(data);
        this.data = data;

        if (data.target.kind === "structure") {
            this.target = Game.getObjectById(data.target.structureId);
        } else {
            const p = data.target.position;
            this.target = new RoomPosition(p.x, p.y, p.roomName);
        }

        this.rebuildReservationsFromAssigned();
    }

    /* ============================================================
       VALIDITY
       ============================================================ */

    public override isStillValid(): boolean {
        return this.target !== null;
    }

    /* ============================================================
       CAPACITY / RESERVATION LOGIC
       ============================================================ */

    /**
     * Rebuild reservations from assigned creeps.
     * Called on construction to survive reloads / tick boundaries.
     */
    private rebuildReservationsFromAssigned(): void {
        this.reservedEnergy = 0;
        this.reservedBy.clear();

        if (!this.target || !(this.target instanceof Structure)) return;

        let remaining = this.target.store.getFreeCapacity(RESOURCE_ENERGY);
        if (remaining <= 0) return;

        for (const [id] of this.data.assignedCreeps) {
            const creep = Game.getObjectById(id);
            if (!creep) continue;

            const claim = Math.min(creepEnergy(creep), remaining);
            if (claim <= 0) continue;

            this.reservedBy.set(creep.id, claim);
            this.reservedEnergy += claim;
            remaining -= claim;

            if (remaining <= 0) break;
        }
    }

    /* ============================================================
       ASSIGNMENT GATE
       ============================================================ */

    public override canAcceptCreep(creepState: CreepState, world: World): boolean {
        if (!super.canAcceptCreep(creepState, world) || !this.target || !hasBodyPart(creepState.creep, CARRY)) {
            return false;
        }

        // Position drops: no capacity limit yet
        if (!(this.target instanceof Structure)) {
            return true;
        }

        const free = this.target.store.getFreeCapacity(RESOURCE_ENERGY);
        const remaining = free - this.reservedEnergy;

        return remaining > 0;
    }

    /* ============================================================
       TASK API
       ============================================================ */

    public override canPerformTask(creepState: CreepState, world: World): boolean {
        if (!hasBodyPart(creepState.creep, CARRY)) {
            return false;
        }

        const energy = creepEnergy(creepState.creep);
        const hasSpace = creepState.creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0;
        const roomHasEnergy = world.resourceManager.roomHasEnoughEnergy(creepState, creepState.creep.room.name);

        // Can perform if:
        // 1. We have energy to deliver (even a partial load)
        // 2. OR we have space AND there is energy in the room to pick up
        return energy > 0 || (hasSpace && roomHasEnergy);
    }

    protected override taskIsFull(): boolean {
        if (!this.target) return true;

        if (this.target instanceof Structure) {
            return this.target.store.getFreeCapacity(RESOURCE_ENERGY) === 0;
        }

        return false;
    }

    public override score(creep: Creep): number {
        if (!this.target) return -Infinity;

        const dist = creep.pos.getRangeTo(this.target);
        const basePenalty = isDedicatedHaulerCreep(creep) ? 0 : isWorkerCreep(creep) ? 120 : 220;
        const rolePenalty = scaledRoleBias(creep.memory.ownerRoom, basePenalty);

        const energy = creepEnergy(creep);
        const energyBonus = energy > 0 ? 50 : 0; // Favor creeps that already have energy

        // Keep logistics mostly on haulers while allowing emergency fallback from workers.
        return -100 - dist + this.priority() * 20 + energyBonus - rolePenalty;
    }

    public override nextAction(creepState: CreepState, resourceManager: ResourceManager, world: World): Action | null {
        if (
            !this.target ||
            (this.target instanceof Structure && this.target.store.getFreeCapacity(RESOURCE_ENERGY) === 0)
        ) {
            creepState.memory.taskId = undefined;
            return null;
        }

        const needsEnergy = creepNeedsEnergy(creepState, world);
        const energy = creepEnergy(creepState.creep);

        // If we have some energy and the target is a spawn/extension, just deliver it!
        // This prevents haulers from walking away from an empty spawn to get 5 more energy.
        const isCriticalSink =
            this.target instanceof Structure &&
            (this.target.structureType === STRUCTURE_SPAWN || this.target.structureType === STRUCTURE_EXTENSION);

        if (needsEnergy && isCriticalSink && energy >= 25) {
            // Deliver what we have
        } else if (needsEnergy) {
            const energyAction = findBestEnergyTask(creepState, this.target, resourceManager);

            if (!energyAction) {
                // Unassign so they can find other work or sit idle for spawn logic
                creepState.memory.taskId = undefined;
                return null;
            }

            return energyAction;
        }

        if (this.target instanceof Structure) {
            return new TransferAction(this.target);
        }

        return new DropAction(this.target);
    }

    public override assignCreep(creepState: CreepState, world: World): void {
        super.assignCreep(creepState, world);

        // Pre-reserve pickup energy immediately if needed
        if (creepNeedsEnergy(creepState, world)) {
            findBestEnergyTask(creepState, this.target, world.resourceManager);
        }

        if (!this.target || !(this.target instanceof Structure)) return;

        const remaining = this.target.store.getFreeCapacity(RESOURCE_ENERGY) - this.reservedEnergy;
        if (remaining <= 0) return;

        // Reserve based on capacity, because empty haulers WILL fill up and deliver that much.
        // This prevents infinite empty haulers from being assigned to the same spawn.
        const capacity = creepState.creep.store.getCapacity(RESOURCE_ENERGY);
        const claim = Math.min(capacity, remaining);
        if (claim <= 0) return;

        this.reservedBy.set(creepState.creep.id, claim);
        this.reservedEnergy += claim;
    }

    public override removeCreep(creepState: CreepState): void {
        super.removeCreep(creepState);

        const claim = this.reservedBy.get(creepState.creep.id);
        if (claim) {
            this.reservedEnergy = Math.max(0, this.reservedEnergy - claim);
            this.reservedBy.delete(creepState.creep.id);
        }
    }

    public override removeDeadCreep(deadName: string) {
        const entry = this.data.assignedCreeps.find(([, name]) => name === deadName);
        if (entry) {
            const [id] = entry;
            const idTyped = id;
            const claim = this.reservedBy.get(idTyped);
            if (claim) {
                this.reservedEnergy = Math.max(0, this.reservedEnergy - claim);
                this.reservedBy.delete(idTyped);
            }
        }

        super.removeDeadCreep(deadName);
    }

    public override validCreationSetup(): void {}

    public override requirements(): TaskRequirements {
        const energyPerTick = this.data.energyPerTick ?? 10;
        const distance = this.data.distance ?? 15;
        const roundTrip = distance * 2;

        return {
            carry: {
                parts: Math.ceil((energyPerTick * roundTrip) / 50)
            }
        };
    }

    /* ============================================================
       PRIORITY
       ============================================================ */

    private priority(): number {
        const structure = this.target instanceof Structure ? this.target : null;
        if (!structure) return -10;

        switch (structure.structureType) {
            case STRUCTURE_SPAWN:
                return 10;
            case STRUCTURE_EXTENSION:
                return 9;
            case STRUCTURE_TOWER:
                return 8;
            case STRUCTURE_CONTAINER:
                return 4;
            case STRUCTURE_STORAGE:
                return 2;
            default:
                return 0;
        }
    }
}
