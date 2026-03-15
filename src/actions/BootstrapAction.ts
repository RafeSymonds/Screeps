import { CreepState } from "creeps/CreepState";
import { Action } from "./Action";
import { moveTo } from "creeps/CreepController";

/* ============================================================
   STRUCTURE VALUE — how much is this structure worth building?
   ============================================================ */

const STRUCTURE_VALUE: Partial<Record<BuildableStructureConstant, number>> = {
    [STRUCTURE_SPAWN]: 500,
    [STRUCTURE_TOWER]: 200,
    [STRUCTURE_EXTENSION]: 150,
    [STRUCTURE_STORAGE]: 120,
    [STRUCTURE_TERMINAL]: 100,
    [STRUCTURE_CONTAINER]: 80,
    [STRUCTURE_LINK]: 70,
    [STRUCTURE_ROAD]: 30,
    [STRUCTURE_RAMPART]: 20,
    [STRUCTURE_WALL]: 10,
    [STRUCTURE_LAB]: 60,
    [STRUCTURE_EXTRACTOR]: 40,
    [STRUCTURE_OBSERVER]: 15
};

function structureValue(type: BuildableStructureConstant): number {
    return STRUCTURE_VALUE[type] ?? 25;
}

/* ============================================================
   ACTION CANDIDATES — scored options the creep can take
   ============================================================ */

type ActionCandidate = {
    score: number;
    execute: (creepState: CreepState) => void;
};

export class BootstrapAction extends Action {
    constructor(
        private readonly targetRoom: string,
        private readonly helperRoom: string
    ) {
        super();
    }

    public override perform(creepState: CreepState): void {
        const creep = creepState.creep;
        const energy = creep.store.getUsedCapacity(RESOURCE_ENERGY);

        // Go to target room if not there
        if (creep.room.name !== this.targetRoom) {
            moveTo(creepState, new RoomPosition(25, 25, this.targetRoom));
            return;
        }

        const room = Game.rooms[this.targetRoom];
        if (!room) return;

        const candidates: ActionCandidate[] = [];

        if (energy > 0) {
            this.scoreWorkTargets(creepState, room, candidates);
        }

        this.scoreEnergySources(creepState, room, candidates);

        if (candidates.length === 0) return;

        // Pick best action
        candidates.sort((a, b) => b.score - a.score);
        candidates[0].execute(creepState);
    }

    private scoreWorkTargets(creepState: CreepState, room: Room, candidates: ActionCandidate[]): void {
        const creep = creepState.creep;
        const energyRatio = creep.store.getUsedCapacity(RESOURCE_ENERGY) / creep.store.getCapacity(RESOURCE_ENERGY);

        // Build sites
        for (const site of room.find(FIND_CONSTRUCTION_SITES)) {
            const range = creep.pos.getRangeTo(site);
            const moveCost = range * 2;
            const progress = site.progress / site.progressTotal;
            const value = structureValue(site.structureType);

            // Nearly-done sites get a completion bonus
            const completionBonus = progress * value * 0.5;

            // Having more energy makes building more valuable (don't build with 1 energy)
            const score = (value + completionBonus - moveCost) * energyRatio;

            candidates.push({
                score,
                execute: (cs) => {
                    const result = cs.creep.build(site);
                    if (result === ERR_NOT_IN_RANGE) moveTo(cs, site);
                }
            });
        }

        // Repair damaged structures
        for (const struct of room.find(FIND_STRUCTURES)) {
            if (struct.structureType === STRUCTURE_WALL || struct.structureType === STRUCTURE_RAMPART) continue;
            const hpRatio = struct.hits / struct.hitsMax;
            if (hpRatio >= 0.8) continue;

            const range = creep.pos.getRangeTo(struct);
            const urgency = (1 - hpRatio) * 100;
            const score = (urgency - range * 2) * energyRatio;

            candidates.push({
                score,
                execute: (cs) => {
                    const result = cs.creep.repair(struct);
                    if (result === ERR_NOT_IN_RANGE) moveTo(cs, struct);
                }
            });
        }

        // Upgrade controller
        if (room.controller?.my) {
            const range = creep.pos.getRangeTo(room.controller);
            // Upgrading is baseline work — low priority but always available
            const score = (15 - range * 2) * energyRatio;

            candidates.push({
                score,
                execute: (cs) => {
                    const result = cs.creep.upgradeController(room.controller!);
                    if (result === ERR_NOT_IN_RANGE) moveTo(cs, room.controller!);
                }
            });
        }
    }

    private scoreEnergySources(creepState: CreepState, room: Room, candidates: ActionCandidate[]): void {
        const creep = creepState.creep;
        const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
        if (freeCapacity === 0) return;

        const needRatio = freeCapacity / creep.store.getCapacity(RESOURCE_ENERGY);

        // Storage
        if (room.storage && room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            const range = creep.pos.getRangeTo(room.storage);
            const amount = Math.min(freeCapacity, room.storage.store.getUsedCapacity(RESOURCE_ENERGY));
            // Withdraw is instant — high throughput
            const score = (amount / 50 * 8 - range * 2) * needRatio;

            candidates.push({
                score,
                execute: (cs) => {
                    const result = cs.creep.withdraw(room.storage!, RESOURCE_ENERGY);
                    if (result === ERR_NOT_IN_RANGE) moveTo(cs, room.storage!);
                }
            });
        }

        // Containers
        for (const struct of room.find(FIND_STRUCTURES)) {
            if (struct.structureType !== STRUCTURE_CONTAINER) continue;
            const container = struct as StructureContainer;
            const amount = container.store.getUsedCapacity(RESOURCE_ENERGY);
            if (amount === 0) continue;

            const range = creep.pos.getRangeTo(container);
            const pickup = Math.min(freeCapacity, amount);
            const score = (pickup / 50 * 6 - range * 2) * needRatio;

            candidates.push({
                score,
                execute: (cs) => {
                    const result = cs.creep.withdraw(container, RESOURCE_ENERGY);
                    if (result === ERR_NOT_IN_RANGE) moveTo(cs, container);
                }
            });
        }

        // Dropped energy
        for (const resource of room.find(FIND_DROPPED_RESOURCES)) {
            if (resource.resourceType !== RESOURCE_ENERGY) continue;
            const range = creep.pos.getRangeTo(resource);
            const pickup = Math.min(freeCapacity, resource.amount);
            const score = (pickup / 50 * 7 - range * 2) * needRatio;

            candidates.push({
                score,
                execute: (cs) => {
                    const result = cs.creep.pickup(resource);
                    if (result === ERR_NOT_IN_RANGE) moveTo(cs, resource);
                }
            });
        }

        // Tombstones
        for (const tomb of room.find(FIND_TOMBSTONES)) {
            const amount = tomb.store.getUsedCapacity(RESOURCE_ENERGY);
            if (amount === 0) continue;
            const range = creep.pos.getRangeTo(tomb);
            const score = (Math.min(freeCapacity, amount) / 50 * 7 - range * 2) * needRatio;

            candidates.push({
                score,
                execute: (cs) => {
                    const result = cs.creep.withdraw(tomb, RESOURCE_ENERGY);
                    if (result === ERR_NOT_IN_RANGE) moveTo(cs, tomb);
                }
            });
        }

        // Ruins
        for (const ruin of room.find(FIND_RUINS)) {
            const amount = ruin.store.getUsedCapacity(RESOURCE_ENERGY);
            if (amount === 0) continue;
            const range = creep.pos.getRangeTo(ruin);
            const score = (Math.min(freeCapacity, amount) / 50 * 7 - range * 2) * needRatio;

            candidates.push({
                score,
                execute: (cs) => {
                    const result = cs.creep.withdraw(ruin, RESOURCE_ENERGY);
                    if (result === ERR_NOT_IN_RANGE) moveTo(cs, ruin);
                }
            });
        }

        // Harvest sources directly
        for (const source of room.find(FIND_SOURCES_ACTIVE)) {
            const range = creep.pos.getRangeTo(source);
            // Harvesting is 2 energy/WORK/tick — slower than withdraw but always available
            const score = (4 - range * 2) * needRatio;

            candidates.push({
                score,
                execute: (cs) => {
                    const result = cs.creep.harvest(source);
                    if (result === ERR_NOT_IN_RANGE) moveTo(cs, source);
                }
            });
        }
    }
}
