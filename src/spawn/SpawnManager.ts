import { FLEX_WORKERS, MAX_ROOM_POPULATION, MIN_MINER_ENERGY, MIN_SPAWN_ENERGY } from "config/constants";
import { JobBoard } from "jobs/JobBoard";
import { SpawnRequest, SpawnRole } from "spawn/types";
import { bodyCost, buildBody } from "spawn/bodies";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { SpawnRequestQueue } from "spawn/queue";
import { laborSupply } from "spawn/demand";
import { warn } from "utils/logger";

interface SpawnDecision {
    role: SpawnRole;
    body: BodyPartConstant[];
    owner?: string;
}

/**
 * Turns demand into creeps. Merges controller SpawnRequests (highest priority
 * first) with economy job demand, applies a population floor so a wiped room can
 * never collapse, and sizes bodies to the room's energy.
 */
export class SpawnManager {
    public run(world: World, board: JobBoard, queue: SpawnRequestQueue): void {
        for (const worldRoom of world.myRooms) {
            const spawn = worldRoom.spawns.find(structure => !structure.spawning);
            if (!spawn) {
                continue;
            }
            const decision = this.decide(worldRoom, world, board, queue);
            if (!decision || bodyCost(decision.body) > worldRoom.energyAvailable) {
                continue;
            }
            this.spawn(spawn, worldRoom.name, decision);
        }
    }

    private spawn(spawn: StructureSpawn, roomName: string, decision: SpawnDecision): void {
        const name = `${decision.role}-${Game.time}-${Math.floor(Math.random() * 1000)}`;
        const memory: CreepMemory = {
            spawnRole: decision.role,
            home: roomName,
            working: false,
            controller: decision.owner
        };
        const result = spawn.spawnCreep(decision.body, name, { memory });
        if (result !== OK && result !== ERR_NOT_ENOUGH_ENERGY && result !== ERR_BUSY) {
            warn(`spawn ${name} failed: ${result}`);
        }
    }

    private decide(worldRoom: WorldRoom, world: World, board: JobBoard, queue: SpawnRequestQueue): SpawnDecision | null {
        // 1) Controller requests (defense/combat/expansion) outrank economy.
        const requests = queue.forRoom(worldRoom.name);
        if (requests.length > 0) {
            return this.fromRequest(requests[0], worldRoom);
        }
        // 2) Economy: floor + demand.
        return this.decideEconomy(worldRoom, world, board);
    }

    private fromRequest(request: SpawnRequest, worldRoom: WorldRoom): SpawnDecision {
        return {
            role: request.role,
            body: request.body ?? buildBody(request.role, worldRoom.energyAvailable),
            owner: request.owner
        };
    }

    private decideEconomy(worldRoom: WorldRoom, world: World, board: JobBoard): SpawnDecision | null {
        const population = world.creepsForRoom(worldRoom.name);
        const energyNow = worldRoom.energyAvailable;

        // Floor: a room with no working labor must always recover, using whatever
        // energy is on hand right now.
        const hasWorker = population.some(creep => creep.getActiveBodyparts(WORK) > 0);
        if (population.length === 0 || !hasWorker) {
            return { role: SpawnRole.Generalist, body: buildBody(SpawnRole.Generalist, Math.max(energyNow, 200)) };
        }

        if (population.length >= MAX_ROOM_POPULATION) {
            return null;
        }

        const role = this.chooseRole(worldRoom, world, board, population);
        if (!role) {
            return null;
        }

        // Bank energy for a properly sized creep once the economy is stable.
        const threshold =
            population.length >= 2 ? worldRoom.energyCapacityAvailable : Math.min(MIN_SPAWN_ENERGY, worldRoom.energyCapacityAvailable);
        if (energyNow < threshold) {
            return null;
        }

        return { role, body: buildBody(role, energyNow) };
    }

    /**
     * Pick the next body to add, targeting a base composition before chasing
     * residual demand:
     *   1. one static miner per source (drop-mining — no container needed),
     *      interleaved with haulers so every miner has a ferry feeding the room,
     *   2. a few WORK+CARRY flex workers for build/upgrade (miners/haulers can't),
     *   3. then top up by aggregate labor demand.
     * Below the miner-affordability floor the room runs on plain generalists.
     */
    private chooseRole(worldRoom: WorldRoom, world: World, board: JobBoard, population: Creep[]): SpawnRole | null {
        const has = (role: SpawnRole) => population.filter(creep => creep.memory.spawnRole === role).length;
        const sources = worldRoom.sources.length;

        // Too poor for a worthwhile static miner: generalists do everything.
        if (worldRoom.energyCapacityAvailable < MIN_MINER_ENERGY) {
            return this.hasDemand(worldRoom, world, board) ? SpawnRole.Generalist : null;
        }

        const miners = has(SpawnRole.Miner);
        const haulers = has(SpawnRole.Hauler);

        // Core logistics. A miner with no ferry just piles decaying energy, so add
        // a hauler the moment miners outnumber haulers; otherwise grow miners up to
        // one per source, then top haulers up to one more than the sources.
        if (haulers < miners) {
            return SpawnRole.Hauler;
        }
        if (miners < sources) {
            return SpawnRole.Miner;
        }
        if (haulers < sources + 1) {
            return SpawnRole.Hauler;
        }

        // Flex labor for the jobs specialists can't take (build, upgrade).
        const flex = has(SpawnRole.Worker) + has(SpawnRole.Generalist);
        if (flex < FLEX_WORKERS) {
            return SpawnRole.Worker;
        }

        // Base composition met — follow residual demand, carry before work.
        const demand = board.demand(worldRoom.name);
        const supply = laborSupply(world, worldRoom.name);
        if (supply.carry < demand.carry) {
            return SpawnRole.Hauler;
        }
        if (supply.work < demand.work) {
            return SpawnRole.Worker;
        }
        return null;
    }

    private hasDemand(worldRoom: WorldRoom, world: World, board: JobBoard): boolean {
        const demand = board.demand(worldRoom.name);
        const supply = laborSupply(world, worldRoom.name);
        return supply.work < demand.work || supply.carry < demand.carry;
    }
}
