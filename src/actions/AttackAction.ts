import { moveAwayFromThreats } from "combat/CombatMovement";
import { combatPower, hostileThreat, selectPriorityHostile, weakestFriendly } from "combat/CombatUtils";
import { moveTo } from "creeps/CreepController";
import { countBodyParts } from "creeps/CreepUtils";
import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";

export class AttackAction extends Action {
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
        if (countBodyParts(creep, HEAL) === 0) return;

        if (creep.hits < creep.hitsMax) {
            creep.heal(creep);
            return;
        }

        const ally = weakestFriendly(friendlies.filter(f => creep.pos.getRangeTo(f) <= 3));
        if (!ally) return;

        if (creep.pos.isNearTo(ally)) {
            creep.heal(ally);
        } else {
            creep.rangedHeal(ally);
        }
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;
        const squad = this.squadMates();
        const friendlies = creep.room.find(FIND_MY_CREEPS);

        // Rally point: wait for squad before entering target room
        if (creep.room.name !== this.targetRoom) {
            const nearbySquad = squad.filter(m => m.id !== creep.id && m.room.name === creep.room.name);

            // Wait for squad if not all assembled and we're close to target
            if (squad.length < this.desiredSquadSize && nearbySquad.length < this.desiredSquadSize - 1) {
                this.heal(creep, friendlies);
                // Move toward target room but stop at border
                const exitDir = creep.room.findExitTo(this.targetRoom);
                if (exitDir !== ERR_NO_PATH && exitDir !== ERR_INVALID_ARGS) {
                    const exit = creep.pos.findClosestByRange(exitDir);
                    if (exit && creep.pos.getRangeTo(exit) > 3) {
                        moveTo(creepState, exit);
                    }
                }
                return;
            }

            this.heal(creep, friendlies);
            moveTo(creepState, new RoomPosition(25, 25, this.targetRoom));
            return;
        }

        // In target room
        const hostiles = creep.room.find(FIND_HOSTILE_CREEPS);
        const hostileStructures = creep.room
            .find(FIND_HOSTILE_STRUCTURES)
            .filter(s => s.structureType !== STRUCTURE_CONTROLLER && s.structureType !== STRUCTURE_KEEPER_LAIR);

        // No hostiles and no structures - we're done or need to demolish
        if (hostiles.length === 0 && hostileStructures.length === 0) {
            this.heal(creep, friendlies);
            return;
        }

        // Fight creeps first
        if (hostiles.length > 0) {
            const target = selectPriorityHostile(creep.pos, hostiles);
            if (!target) return;

            const rangedParts = countBodyParts(creep, RANGED_ATTACK);
            const nearbyThreats = hostiles.filter(h => creep.pos.getRangeTo(h) <= 4);
            const nearbyThreat = nearbyThreats.reduce((t, h) => t + hostileThreat(h), 0);
            const nearbySquad = squad.filter(m => m.id !== creep.id && creep.pos.getRangeTo(m) <= 4);
            const nearbyPower = combatPower(creep) + nearbySquad.reduce((t, m) => t + combatPower(m), 0);
            const lowHealth = creep.hits < creep.hitsMax * 0.5;
            const shouldRetreat = lowHealth || nearbyThreat > nearbyPower * 2;

            // Attack
            if (rangedParts > 0) {
                const adjacent = hostiles.filter(h => creep.pos.getRangeTo(h) <= 1);
                if (adjacent.length >= 2) {
                    creep.rangedMassAttack();
                } else if (creep.pos.getRangeTo(target) <= 3) {
                    creep.rangedAttack(target);
                }
            }

            if (countBodyParts(creep, ATTACK) > 0 && creep.pos.isNearTo(target)) {
                creep.attack(target);
            }

            this.heal(creep, friendlies);

            if (shouldRetreat) {
                moveAwayFromThreats(creepState, nearbyThreats.length > 0 ? nearbyThreats : [target]);
                return;
            }

            // Kite at range 3 for ranged creeps
            const range = creep.pos.getRangeTo(target);
            if (rangedParts > 0 && range < 3) {
                moveAwayFromThreats(creepState, [target]);
                return;
            }

            if (range > (rangedParts > 0 ? 3 : 1)) {
                moveTo(creepState, target);
            }
            return;
        }

        // Demolish structures
        this.heal(creep, friendlies);
        const closestStructure = creep.pos.findClosestByRange(hostileStructures);
        if (closestStructure) {
            if (creep.pos.isNearTo(closestStructure)) {
                if (countBodyParts(creep, ATTACK) > 0) {
                    creep.attack(closestStructure as any);
                }
                if (countBodyParts(creep, RANGED_ATTACK) > 0) {
                    creep.rangedAttack(closestStructure as any);
                }
            } else {
                moveTo(creepState, closestStructure);
            }
        }
    }
}
