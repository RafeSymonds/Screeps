import { MAX_ROOM_POPULATION, MIN_MINER_ENERGY, MIN_SPAWN_ENERGY } from "config/constants";
import { JobBoard } from "jobs/JobBoard";
import { SpawnRequest, SpawnRole } from "spawn/types";
import { bodyCost, buildBody } from "spawn/bodies";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { SpawnRequestQueue } from "spawn/queue";
import { LaborKind } from "economy/types";
import { pickDeficitRole, roomDemand } from "economy/EnergyModel";
import { warn } from "utils/logger";

interface SpawnDecision {
    role: SpawnRole;
    body: BodyPartConstant[];
    owner?: string;
}

/**
 * Turns demand into creeps. Merges controller SpawnRequests (highest priority
 * first) with economy demand, applies a population floor so a wiped room can
 * never collapse, and sizes bodies to the room's energy.
 *
 * Economy demand is no longer a hardcoded composition: the EnergyModel measures
 * each room's energy flow and emits three labor targets (income / logistics /
 * consumption); this manager spawns whichever is most under-supplied. See
 * src/economy/EnergyModel.ts and docs/architecture/ENERGY_FLOW_SPAWNING.md.
 */
export class SpawnManager {
    public run(world: World, _board: JobBoard, queue: SpawnRequestQueue): void {
        for (const worldRoom of world.myRooms) {
            const spawn = worldRoom.spawns.find(structure => !structure.spawning);
            if (!spawn) {
                continue;
            }
            const decision = this.decide(worldRoom, world, queue);
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

    private decide(worldRoom: WorldRoom, world: World, queue: SpawnRequestQueue): SpawnDecision | null {
        // 1) Controller requests (defense/combat/expansion) outrank economy.
        const requests = queue.forRoom(worldRoom.name);
        if (requests.length > 0) {
            return this.fromRequest(requests[0], worldRoom);
        }
        // 2) Economy: floor + energy-flow demand.
        return this.decideEconomy(worldRoom, world);
    }

    private fromRequest(request: SpawnRequest, worldRoom: WorldRoom): SpawnDecision {
        return {
            role: request.role,
            body: request.body ?? buildBody(request.role, worldRoom.energyAvailable),
            owner: request.owner
        };
    }

    private decideEconomy(worldRoom: WorldRoom, world: World): SpawnDecision | null {
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

        const role = this.chooseRole(worldRoom, world);
        if (!role) {
            return null;
        }

        // Bank energy for a properly sized creep once the economy is stable.
        const threshold =
            population.length >= 2
                ? worldRoom.energyCapacityAvailable
                : Math.min(MIN_SPAWN_ENERGY, worldRoom.energyCapacityAvailable);
        if (energyNow < threshold) {
            return null;
        }

        return { role, body: buildBody(role, energyNow) };
    }

    /**
     * Pick the next body from the energy-flow model: spawn whichever flow stage is
     * most under-supplied. Below the dedicated-body affordability floor, every gap
     * is filled by a generalist (which serves all three stages). Returns null when
     * all targets are met — the room is staffed and surplus banks into storage.
     */
    private chooseRole(worldRoom: WorldRoom, world: World): SpawnRole | null {
        const kind = pickDeficitRole(roomDemand(worldRoom, world));
        if (!kind) {
            return null;
        }
        if (worldRoom.energyCapacityAvailable < MIN_MINER_ENERGY) {
            return SpawnRole.Generalist;
        }
        switch (kind) {
            case LaborKind.Miner:
                return SpawnRole.Miner;
            case LaborKind.Hauler:
                return SpawnRole.Hauler;
            case LaborKind.Consumer:
                return SpawnRole.Worker;
            default:
                return null;
        }
    }
}
