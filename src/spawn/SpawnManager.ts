import { MAX_ROOM_POPULATION, MIN_SPAWN_ENERGY, SPECIALIZE_ENERGY } from "config/constants";
import { JobBoard } from "jobs/JobBoard";
import { SpawnRequest, SpawnRole } from "spawn/types";
import { bodyCost, buildBody } from "spawn/bodies";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { SpawnRequestQueue } from "spawn/queue";
import { LaborKind } from "economy/types";
import { pickRoomLabor, remoteHeadroom } from "economy/EnergyModel";
import { warn } from "utils/logger";

/** An economy role choice plus, for remote-mining creeps, the room they work in. */
interface RoleChoice {
    role: SpawnRole;
    targetRoom?: string;
}

interface SpawnDecision {
    role: SpawnRole;
    body: BodyPartConstant[];
    owner?: string;
    targetRoom?: string;
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
            controller: decision.owner,
            targetRoom: decision.targetRoom
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
            owner: request.owner,
            targetRoom: request.targetRoom
        };
    }

    private decideEconomy(worldRoom: WorldRoom, world: World): SpawnDecision | null {
        const population = world.creepsForRoom(worldRoom.name);
        const homePopulation = population.filter(creep => !creep.memory.targetRoom);
        const energyNow = worldRoom.energyAvailable;

        // Floor keys off HOME labor only: a room whose only WORK creeps are away in
        // remotes still needs a local worker to keep its own economy alive.
        const hasWorker = homePopulation.some(creep => creep.getActiveBodyparts(WORK) > 0);
        if (homePopulation.length === 0 || !hasWorker) {
            return { role: SpawnRole.Worker, body: buildBody(SpawnRole.Worker, Math.max(energyNow, 200)) };
        }

        // Total population (home + remote) is capped, with extra headroom per remote.
        if (population.length >= MAX_ROOM_POPULATION + remoteHeadroom(worldRoom.name)) {
            return null;
        }

        const pick = this.chooseRole(worldRoom, world);
        if (!pick) {
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

        return { role: pick.role, body: buildBody(pick.role, energyNow), targetRoom: pick.targetRoom };
    }

    /**
     * Map the energy-flow model's next-labor decision to a body. `pickRoomLabor`
     * ranks home AND remote infrastructure together by deficit (consumer last), so
     * a remote stage comes back with the room to tag the creep with. Below the
     * specialize threshold every gap is a `Worker` (the universal WORK+CARRY body
     * that can mine, haul, and upgrade); remotes are RCL3+, above this. Returns null
     * when everything is staffed.
     */
    private chooseRole(worldRoom: WorldRoom, world: World): RoleChoice | null {
        const labor = pickRoomLabor(worldRoom, world);
        if (!labor) {
            return null;
        }
        if (worldRoom.energyCapacityAvailable < SPECIALIZE_ENERGY) {
            // Below the specialize threshold every gap is a universal WORK+CARRY
            // `Worker` (it can mine, haul, and upgrade). Remotes wait until the room
            // can field a dedicated miner — see the note in pickRoomLabor.
            return { role: SpawnRole.Worker };
        }
        switch (labor.kind) {
            case LaborKind.Miner:
                return { role: SpawnRole.Miner, targetRoom: labor.roomName };
            case LaborKind.Hauler:
                return { role: SpawnRole.Hauler, targetRoom: labor.roomName };
            case LaborKind.Consumer:
                return { role: SpawnRole.Worker };
            default:
                return null;
        }
    }
}
