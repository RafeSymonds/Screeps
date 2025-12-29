import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { getDefaultCreepMemory } from "creeps/CreepMemory";
import { countBodyParts, hasBodyPart } from "creeps/CreepUtils";
import { TaskRequirements } from "tasks/core/TaskRequirements";
import { CreepState } from "creeps/CreepState";

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

type EnergyFlow = {
    production: number; // energy per tick produced
    transport: number; // energy per tick movable
    consumption: number; // energy per tick desired
};

/* ================================
   BODY BUILDERS
   ================================ */

function scoutBody(energy: number): BodyPartConstant[] {
    return [MOVE];
}

function minerBody(energy: number, mineNeeded: number): BodyPartConstant[] {
    const maxWork = Math.floor((energy - 50) / 100);
    const work = Math.max(1, Math.min(mineNeeded, maxWork));
    return [MOVE, ...Array(work).fill(WORK)];
}

function haulerBody(energy: number): BodyPartConstant[] {
    const unitCost = 100; // CARRY + MOVE
    const units = Math.max(1, Math.floor(energy / unitCost));

    const body: BodyPartConstant[] = [];
    for (let i = 0; i < units; i++) {
        body.push(CARRY, MOVE);
    }
    return body;
}

function workerBody(energy: number): BodyPartConstant[] {
    const unitCost = 200; // WORK + CARRY + MOVE
    const units = Math.max(1, Math.floor(energy / unitCost));

    const body: BodyPartConstant[] = [];
    for (let i = 0; i < units; i++) {
        body.push(WORK, CARRY, MOVE);
    }
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

function isScout(cs: CreepState) {
    return !hasBodyPart(cs.creep, WORK) && !hasBodyPart(cs.creep, CARRY) && hasBodyPart(cs.creep, MOVE);
}

/* ================================
   CAPABILITY DERIVATION (PER ROOM)
   ================================ */

type CapabilityTotals = {
    mine: number;
    work: number;
    carry: number;
    vision: number;
};

function deriveSupply(worldRoom: WorldRoom): CapabilityTotals {
    const supply: CapabilityTotals = {
        mine: 0,
        work: 0,
        carry: 0,
        vision: 0
    };

    for (const cs of worldRoom.myCreeps) {
        const workParts = countBodyParts(cs.creep, WORK);

        if (isMiner(cs)) {
            supply.mine += workParts;
        }

        if (isWorker(cs)) {
            supply.work += workParts;
        }

        supply.carry += countBodyParts(cs.creep, CARRY);
        supply.vision += 1;
    }

    return supply;
}

function deriveDemand(tasks: { requirements(): TaskRequirements }[]): CapabilityTotals {
    const demand: CapabilityTotals = {
        mine: 0,
        work: 0,
        carry: 0,
        vision: 0
    };

    for (const task of tasks) {
        const r = task.requirements();

        if (r.mine) {
            demand.mine += r.mine;
        }
        if (r.work) {
            demand.work += r.work;
        }
        if (r.carry) {
            demand.carry += r.carry;
        }
        if (r.vision) {
            demand.vision += 1;
        }
    }

    return demand;
}

function computeEnergyFlow(demand: CapabilityTotals, supply: CapabilityTotals): EnergyFlow {
    // 1 WORK = 2 energy / tick when mining
    const production = supply.mine * 2;

    // transport is derived from carry throughput
    // supply.carry is in "carry parts"
    // 50 energy per carry, amortized over time
    const transport = supply.carry; // already normalized by tasks

    // consumption is driven by deliver tasks (carry demand)
    const consumption = demand.carry;

    return { production, transport, consumption };
}

/* ================================
   INTENT SELECTION POLICY
   ================================ */

function selectSpawnIntent(demand: CapabilityTotals, supply: CapabilityTotals): SpawnIntent | null {
    const flow = computeEnergyFlow(demand, supply);

    const visionDeficit = Math.max(0, demand.vision - supply.vision);

    console.log("[FLOW]", `prod:${flow.production} trans:${flow.transport} cons:${flow.consumption}`);

    // 2️⃣ Transport bottleneck
    // Producing energy we cannot move
    if (flow.production > flow.transport) {
        return { kind: SpawnIntentKind.HAULER, carry: demand.carry };
    }

    // 3️⃣ Production bottleneck
    // Want more energy than we produce AND we can transport it
    if (flow.consumption > flow.production && flow.transport >= flow.production) {
        const mineDeficit = demand.mine - supply.mine;
        if (mineDeficit > 0) {
            return { kind: SpawnIntentKind.MINER, mine: mineDeficit };
        }
    }

    // 4️⃣ Distribution / flexible labor
    if (flow.transport > flow.consumption && demand.work > supply.work) {
        return {
            kind: SpawnIntentKind.WORKER,
            work: demand.work - supply.work,
            carry: demand.carry - supply.carry
        };
    }

    // 1️⃣ Vision (binary, independent)
    if (visionDeficit > 0) {
        return { kind: SpawnIntentKind.SCOUT };
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

        const demand = deriveDemand(tasks);
        const supply = deriveSupply(worldRoom);

        const intent = selectSpawnIntent(demand, supply);
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
