import { safeAnchorPosition, moveAwayFromThreats } from "combat/CombatMovement";
import { combatPower, hostileThreat, selectPriorityHostile, weakestFriendly } from "combat/CombatUtils";
import { moveTo } from "creeps/CreepController";
import { countBodyParts } from "creeps/CreepUtils";
import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";

export class CombatAction extends Action {
    constructor(
        private readonly targetRoom: string,
        private readonly assignedCreeps: [Id<Creep>, string][],
        private readonly desiredSquadSize: number
    ) {
        super();
    }

    private squadMates(): Creep[] {
        return this.assignedCreeps
            .map(([id]) => Game.getObjectById(id))
            .filter((creep): creep is Creep => creep !== null);
    }

    private heal(creep: Creep, friendlies: Creep[]): void {
        if (countBodyParts(creep, HEAL) === 0) {
            return;
        }

        if (creep.hits < creep.hitsMax) {
            creep.heal(creep);
            return;
        }

        const ally = weakestFriendly(friendlies.filter(friendly => creep.pos.getRangeTo(friendly) <= 3));
        if (!ally) {
            return;
        }

        if (creep.pos.isNearTo(ally)) {
            creep.heal(ally);
        } else {
            creep.rangedHeal(ally);
        }
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;
        const friendlies = creep.room.find(FIND_MY_CREEPS);
        const anchor = safeAnchorPosition(this.targetRoom);

        if (creep.room.name !== this.targetRoom) {
            this.heal(creep, friendlies);
            moveTo(creepState, new RoomPosition(25, 25, this.targetRoom));
            return;
        }

        const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        if (hostiles.length === 0) {
            this.heal(creep, friendlies);
            if (creep.pos.getRangeTo(anchor) > 3) {
                moveTo(creepState, anchor);
            }
            return;
        }

        const target = selectPriorityHostile(creep.pos, hostiles);
        if (!target) {
            return;
        }

        const meleeParts = countBodyParts(creep, ATTACK);
        const rangedParts = countBodyParts(creep, RANGED_ATTACK);
        const squad = this.squadMates().filter(squadMate => squadMate.room.name === this.targetRoom);
        const nearbySquad = squad.filter(squadMate => squadMate.id !== creep.id && creep.pos.getRangeTo(squadMate) <= 4);
        const nearbyThreats = hostiles.filter(hostile => creep.pos.getRangeTo(hostile) <= 4);
        const nearbyThreat = nearbyThreats.reduce((total, hostile) => total + hostileThreat(hostile), 0);
        const nearbySupport = combatPower(creep) + nearbySquad.reduce((total, squadMate) => total + combatPower(squadMate), 0);
        const lowHealth = creep.hits < creep.hitsMax * 0.6;
        const shouldRetreat = lowHealth || nearbyThreat > nearbySupport * 1.5;
        const shouldRegroup =
            this.desiredSquadSize > 1 &&
            squad.length < this.desiredSquadSize &&
            creep.pos.getRangeTo(target) <= 6 &&
            nearbySquad.length === 0;

        if (rangedParts > 0) {
            const adjacentHostiles = hostiles.filter(hostile => creep.pos.getRangeTo(hostile) <= 1);
            if (adjacentHostiles.length >= 2) {
                creep.rangedMassAttack();
            } else if (creep.pos.getRangeTo(target) <= 3) {
                creep.rangedAttack(target);
            }
        }

        if (meleeParts > 0 && creep.pos.isNearTo(target)) {
            creep.attack(target);
        }

        this.heal(creep, friendlies);

        if (shouldRetreat) {
            if (!moveAwayFromThreats(creepState, nearbyThreats.length > 0 ? nearbyThreats : [target], anchor)) {
                moveTo(creepState, anchor);
            }
            return;
        }

        if (shouldRegroup) {
            const nearestMate = creep.pos.findClosestByRange(nearbySquad.length > 0 ? nearbySquad : squad);
            if (nearestMate && creep.pos.getRangeTo(nearestMate) > 1) {
                moveTo(creepState, nearestMate);
                return;
            }
        }

        const desiredRange = rangedParts > 0 ? 3 : 1;
        const range = creep.pos.getRangeTo(target);

        if (rangedParts > 0 && range < 3) {
            moveAwayFromThreats(creepState, [target], anchor);
            return;
        }

        if (range > desiredRange) {
            moveTo(creepState, target);
        }
    }
}
