import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { getDefaultCreepMemory } from "creeps/CreepMemory";
import { countBodyParts, hasBodyPart } from "creeps/CreepUtils";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { CreepState } from "creeps/CreepState";

/* ================================
   MODEL NOTE
   ================================

TaskRequirements should support:
- mine?: number    // mining-only throughput in WORK parts
- work?: number    // general throughput in WORK parts
- carry?: number   // logistics throughput expressed as "carry parts needed" (already distance-adjusted by tasks)
- ept?: number     // sink demand in energy per tick (spawns/towers/etc.)
- vision?: boolean // interpreted as "needs scouting", satisfied ONLY by scout creeps

*/

/* ================================
   ENUMS
   ================================ */

export enum SpawnIntentKind {
    SCOUT,
    MINER,
    HAULER,
    WORKER
}

type SpawnIntent =
    | { kind: SpawnIntentKind.SCOUT }
    | { kind: SpawnIntentKind.MINER; mine: number }
    | { kind: SpawnIntentKind.HAULER; carry: number }
    | { kind: SpawnIntentKind.WORKER; work: number; carry: number };

const SPAWN_EPT = 8; // spawn + extensions while spawning
const TOWER_IDLE_EPT = 1;
const TOWER_COMBAT_EPT = 10;
const CONTROLLER_MAX_WORK = 15; // max WORK you want on upgrading
const WORKER_SURPLUS_EPT = 4;
const WORKER_EPT_PER_WORK = 3;

/* ================================
   BODY BUILDERS
   ================================ */

function scoutBody(_energy: number): BodyPartConstant[] {
    // Keep scouts cheap; speed comes from being small and disposable.
    return [MOVE];
}

function minerBody(energy: number, mineNeeded: number): BodyPartConstant[] {
    // Template: [MOVE, WORK...]
    const maxWork = Math.floor((energy - 50) / 100);
    const work = Math.max(1, Math.min(mineNeeded, maxWork));
    return [MOVE, ...Array(work).fill(WORK)];
}

function haulerBody(energy: number): BodyPartConstant[] {
    // Simple 1:1 carry:move
    const unitCost = 100; // CARRY + MOVE
    const units = Math.max(1, Math.floor(energy / unitCost));

    const body: BodyPartConstant[] = [];
    for (let i = 0; i < units; i++) body.push(CARRY, MOVE);
    return body;
}

function workerBody(energy: number): BodyPartConstant[] {
    // Simple WORK+CARRY+MOVE unit
    const unitCost = 200;
    const units = Math.max(1, Math.floor(energy / unitCost));

    const body: BodyPartConstant[] = [];
    for (let i = 0; i < units; i++) body.push(WORK, CARRY, MOVE);
    return body;
}

/* ================================
   CREEP CLASSIFICATION
   ================================ */

function isMiner(cs: CreepState): boolean {
    return hasBodyPart(cs.creep, WORK) && hasBodyPart(cs.creep, MOVE) && !hasBodyPart(cs.creep, CARRY);
}

function isWorker(cs: CreepState): boolean {
    return hasBodyPart(cs.creep, WORK) && hasBodyPart(cs.creep, CARRY) && hasBodyPart(cs.creep, MOVE);
}

function isScout(cs: CreepState): boolean {
    return hasBodyPart(cs.creep, MOVE) && !hasBodyPart(cs.creep, WORK) && !hasBodyPart(cs.creep, CARRY);
}

function countCreeps(creeps: CreepState[], pred: (creepState: CreepState) => boolean): number {
    let count = 0;
    for (const creep of creeps) {
        if (pred(creep)) count++;
    }
    return count;
}

/* ================================
   SUPPLY / DEMAND (PER ROOM)
   ================================ */

type Totals = {
    mine: number; // mining WORK parts available
    work: number; // general WORK parts available
    carry: number; // total CARRY parts available
    ept: number; // energy-per-tick sink demand (demand-only)
    scout: number; // number of scout creeps available
};

function deriveSupply(worldRoom: WorldRoom): Totals {
    const supply: Totals = { mine: 0, work: 0, carry: 0, ept: 0, scout: 0 };

    for (const cs of worldRoom.myCreeps) {
        if (isMiner(cs)) {
            supply.mine += countBodyParts(cs.creep, WORK);
        } else if (isWorker(cs)) {
            supply.work += countBodyParts(cs.creep, WORK);
        } else if (isScout(cs)) {
            // Scouting capacity counts ONLY scouts
            supply.scout += 1;
        } else {
            supply.carry += countBodyParts(cs.creep, CARRY);
        }
    }

    return supply;
}

function deriveDemand(tasks: { requirements(): TaskRequirements }[]): Totals {
    const demand: Totals = { mine: 0, work: 0, carry: 0, ept: 0, scout: 0 };

    for (const task of tasks) {
        const r = task.requirements();

        if (r.mine) demand.mine += r.mine;
        if (r.work) demand.work += r.work;
        if (r.carry) demand.carry += r.carry;
        // if (r.ept) demand.ept += r.ept;

        // "vision" means "needs a scout", not "any vision exists"
        if (r.vision) demand.scout += 1;
    }

    return demand;
}

function computeSinkEpt(room: Room): number {
    let ept = 0;

    // Spawning is a hard sink
    const spawns = room.find(FIND_MY_SPAWNS);
    for (const spawn of spawns) {
        if (spawn.spawning) {
            ept += SPAWN_EPT;
        }
    }

    // Towers
    const towers = room.find(FIND_MY_STRUCTURES, {
        filter: s => s.structureType === STRUCTURE_TOWER
    }) as StructureTower[];

    const underAttack = room.find(FIND_HOSTILE_CREEPS).length > 0;
    ept += towers.length * (underAttack ? TOWER_COMBAT_EPT : TOWER_IDLE_EPT);

    return ept;
}

/* ================================
   HELPERS
   ================================ */

// 1 WORK mines 2 energy/tick (ignoring per-source caps; those belong in task demand)
function productionEptFromMiningWork(mineWorkParts: number): number {
    return mineWorkParts * 2;
}

/* ================================
   INTENT SELECTION POLICY
   ================================


So we do:
0) Bootstrap mining/hauling so the room can function
1) Then scouting if needed
2) Then haul/mining/work balancing

Bootstrap rules:
- If mine demand exists but we have zero mining supply -> spawn miner first
- If we have miners (or mine demand) but logistics is behind -> spawn hauler

*/

function selectSpawnIntent(demand: Totals, supply: Totals, worldRoom: WorldRoom): SpawnIntent | null {
    const mineDeficit = Math.max(0, demand.mine - supply.mine);
    const workDeficit = Math.max(0, demand.work - supply.work);
    const carryDeficit = Math.max(0, demand.carry - supply.carry);
    const scoutDeficit = Math.max(0, demand.scout - supply.scout);

    const workerBurnEpt = supply.work * WORKER_EPT_PER_WORK;

    const productionEpt = productionEptFromMiningWork(supply.mine);
    const sinkEpt = demand.ept + workerBurnEpt;

    console.log(
        "[SPAWN]",
        `mineDef:${mineDeficit} workDef:${workDeficit} carryDef:${carryDeficit} scoutDef:${scoutDeficit} prodEpt:${productionEpt} sinkEpt:${sinkEpt}`
    );

    // 0️⃣ BOOTSTRAP: if we need mining but have none, miner comes before scouting.
    if (demand.mine > 0 && supply.mine === 0) {
        return { kind: SpawnIntentKind.MINER, mine: demand.mine };
    }

    // 0️⃣ BOOTSTRAP: if hauling is behind (and mining exists or is demanded), fix hauling early.
    // This prevents "miners exist but nothing moves" and also "mining demand exists but transport is missing".
    if (carryDeficit > 0 && (supply.mine > 0 || demand.mine > 0)) {
        return { kind: SpawnIntentKind.HAULER, carry: carryDeficit };
    }

    // 1️⃣ Scouting (high priority, but after bootstrap)
    if (demand.scout > 0 && supply.scout == 0) {
        return { kind: SpawnIntentKind.SCOUT };
    }

    // 2️⃣ If sinks want more energy than we produce, add mining (up to demand).
    if (
        countCreeps(worldRoom.myCreeps, isMiner) < worldRoom.room.memory.numHarvestSpots &&
        ((sinkEpt > productionEpt && mineDeficit > 0) || (mineDeficit > 0 && carryDeficit === 0))
    ) {
        return { kind: SpawnIntentKind.MINER, mine: mineDeficit };
    }

    if (carryDeficit > 0) {
        return { kind: SpawnIntentKind.HAULER, carry: carryDeficit };
    }

    // 4️⃣ General labor (only when we’re not logistics-starved)
    if (workDeficit > 0 && productionEpt > sinkEpt + WORKER_SURPLUS_EPT) {
        return {
            kind: SpawnIntentKind.WORKER,
            work: workDeficit,
            carry: 0
        };
    }

    return null;
}

/* ================================
   SPAWN MANAGER
   ================================ */

export class SpawnManager {
    public run(world: World): void {
        for (const worldRoom of world.rooms.values()) {
            this.runRoom(worldRoom, world);
        }
    }

    private runRoom(worldRoom: WorldRoom, world: World): void {
        const room = worldRoom.room;

        const spawn = room.find(FIND_MY_SPAWNS)[0];
        if (!spawn || spawn.spawning) return;

        const tasks = world.taskManager.getTasksForRoom(room);

        const sinkEpt = computeSinkEpt(room);
        const demand = deriveDemand(tasks);
        const supply = deriveSupply(worldRoom);

        demand.ept += sinkEpt;

        const intent = selectSpawnIntent(demand, supply, worldRoom);
        if (!intent) return;

        const energy = room.energyAvailable;
        let body: BodyPartConstant[] | null = null;

        switch (intent.kind) {
            case SpawnIntentKind.SCOUT:
                body = scoutBody(energy);
                break;
            case SpawnIntentKind.MINER:
                body = minerBody(energy, intent.mine);
                break;
            case SpawnIntentKind.HAULER:
                body = haulerBody(energy);
                break;
            case SpawnIntentKind.WORKER:
                body = workerBody(energy);
                break;
        }

        if (!body || body.length === 0) return;

        spawn.spawnCreep(body, `${SpawnIntentKind[intent.kind]}-${Game.time}`, {
            memory: getDefaultCreepMemory(room.name)
        });
    }
}
