import { MAX_ROOM_POPULATION, MIN_SPAWN_ENERGY, SOURCE_CONTAINER_RANGE, SPECIALIZE_ENERGY } from "config/constants";
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
            return { role: "generalist", body: buildBody("generalist", Math.max(energyNow, 200)) };
        }

        if (population.length >= MAX_ROOM_POPULATION) {
            return null;
        }

        // Demand-driven: open job slots define demand; live parts define supply.
        // As the matcher fills slots, demand falls and spawning self-limits.
        const demand = board.demand(worldRoom.name);
        const supply = laborSupply(world, worldRoom.name);
        const needWork = supply.work < demand.work;
        const needCarry = supply.carry < demand.carry;
        if (!needWork && !needCarry) {
            return null;
        }

        // Bank energy for a properly sized creep once the economy is stable.
        const threshold =
            population.length >= 2 ? worldRoom.energyCapacityAvailable : Math.min(MIN_SPAWN_ENERGY, worldRoom.energyCapacityAvailable);
        if (energyNow < threshold) {
            return null;
        }

        const role = this.chooseRole(worldRoom, population, needWork, needCarry);
        return { role, body: buildBody(role, energyNow) };
    }

    /**
     * Pick a body category. Stays on cheap generalists until the room can afford
     * specialists AND has source containers (static mining is pointless without
     * them), then fills miners and haulers.
     */
    private chooseRole(worldRoom: WorldRoom, population: Creep[], needWork: boolean, needCarry: boolean): SpawnRole {
        if (worldRoom.energyCapacityAvailable < SPECIALIZE_ENERGY || !this.hasSourceContainers(worldRoom)) {
            return "generalist";
        }
        const miners = population.filter(creep => creep.memory.spawnRole === "miner").length;
        if (needWork && miners < worldRoom.sources.length) {
            return "miner";
        }
        const haulers = population.filter(creep => creep.memory.spawnRole === "hauler").length;
        if (needCarry && haulers <= worldRoom.sources.length) {
            return "hauler";
        }
        return needWork ? "worker" : "hauler";
    }

    private hasSourceContainers(worldRoom: WorldRoom): boolean {
        return worldRoom.sources.some(source =>
            source.pos
                .findInRange(FIND_STRUCTURES, SOURCE_CONTAINER_RANGE)
                .some(structure => structure.structureType === STRUCTURE_CONTAINER)
        );
    }
}
