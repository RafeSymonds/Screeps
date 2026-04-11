import { TaskData } from "tasks/core/TaskData";
import { ErrorMapper } from "utils/ErrorMapper";
import { World } from "world/World";
import { TaskManager } from "tasks/core/TaskManager";
import { assignCreeps } from "tasks/core/TaskAssignment";
import { performCreepActions } from "creeps/CreepActions";
import { EnergyTarget } from "rooms/RoomEnergyState";
import { getCreepMemory, getDefaultCreepMemory } from "creeps/CreepMemory";
import { NeighborMap } from "rooms/RoomTopology";
import { runPlans } from "plans/core/PlanManager";
import { CreepState } from "creeps/CreepState";
import { SpawnManager } from "spawner/SpawnManager";
import { performTowerDefense } from "combat/TowerDefense";
import { clearStalePaths } from "pathing/PathCache";
import { trackCpuUsage } from "cpu/CpuBudget";
import { logEconomyStatus } from "economy/EconomyLogger";
import { BasePlanData } from "basePlaner/AnchorSelection";
import { runMigrations } from "memory/migrations";

declare global {
    interface Memory {
        tasks: TaskData[];
        planRuns?: Record<string, number>;
        cpuAvg?: number;
        version?: number;
    }

    interface CreepMemory {
        taskId?: string;
        taskTicks: number;
        lastTaskKind?: import("tasks/core/TaskKind").TaskKind;
        lastTaskRoom?: string;
        energyTargetId?: Id<EnergyTarget>;
        remoteEnergyReserved?: number;
        remoteEnergyRoom?: string;
        working: boolean;
        ownerRoom: string;
    }

    interface RoomTopology {
        neighbors: NeighborMap;
    }

    interface RoomIntel {
        lastScouted: number;
        owner?: string;
        reservedBy?: string;
        hasEnemyBase: boolean;
        hasInvaderCore: boolean;
        keeperLairs: number;
        hasController: boolean;
        sourceCount: number;
        lastHostileSeen?: number;
        hostileMilitaryParts?: number;
    }

    interface RoomDefenseState {
        hostileCount: number;
        threat: number;
        lastHostileTick: number;
        requestedDefenders: number;
        safeAnchor?: {
            x: number;
            y: number;
            roomName: string;
        };
    }

    type SpawnRequestRole =
        | "scout"
        | "miner"
        | "mineralHarvester"
        | "hauler"
        | "fastFiller"
        | "worker"
        | "defender"
        | "attacker"
        | "reserver";

    interface RoomSpawnRequest {
        role: SpawnRequestRole;
        priority: number;
        desiredCreeps: number;
        expiresAt: number;
        requestedBy: string;
        minEnergy?: number;
    }

    interface RemoteMiningData {
        lastHarvestTick: number;
        sources: [Id<Source>, RoomPosition][];
        ownerRoom?: string;
    }

    type RemoteRoomState = "scouting" | "candidate" | "active" | "saturated" | "unsafe" | "paused" | "reserved";

    interface RemoteRoomStrategy {
        state: RemoteRoomState;
        ownerRoom?: string;
        routeLength?: number;
        score: number;
        sourceCount: number;
        lastEvaluated: number;
        reason?: string;
    }

    type RoomGrowthStage = "bootstrap" | "stabilizing" | "remote" | "surplus";

    interface RoomGrowthState {
        stage: RoomGrowthStage;
        desiredRemoteCount: number;
        expansionScore: number;
        nextClaimTarget?: string;
        nextScoutTarget?: string;
        expansionReady: boolean;
        lastEvaluated: number;
    }

    type RoomSupportKind = "bootstrap" | "economy" | "build" | "defense";

    interface RoomSupportRequest {
        kind: RoomSupportKind;
        priority: number;
        maxHelpers: number;
        expiresAt: number;
        requestedBy: string;
    }

    type RoomOnboardingStage = "settling" | "bootstrapping" | "established";

    interface RoomOnboardingState {
        stage: RoomOnboardingStage;
        needsMiner: boolean;
        needsHauler: boolean;
        needsBuilder: boolean;
        lastEvaluated: number;
    }

    interface SpawnRoleSnapshot {
        supplyParts: number;
        supplyCreeps: number;
        demandParts: number;
        demandCreeps: number;
        idleCreeps: number;
        pressure: number;
    }

    interface RoomSpawnStats {
        lastUpdated: number;
        mine: SpawnRoleSnapshot;
        carry: SpawnRoleSnapshot;
        work: SpawnRoleSnapshot;
        scout: SpawnRoleSnapshot;
        combat: SpawnRoleSnapshot;
        attack: SpawnRoleSnapshot;
    }

    interface RoomMemory {
        topology?: RoomTopology;
        intel?: RoomIntel;
        defense?: RoomDefenseState;
        remoteMining?: RemoteMiningData;
        spawnRequests?: RoomSpawnRequest[];
        spawnStats?: RoomSpawnStats;
        remoteStrategy?: RemoteRoomStrategy;
        growth?: RoomGrowthState;
        supportRequest?: RoomSupportRequest;
        onboarding?: RoomOnboardingState;
        anchorSpawnId?: Id<StructureSpawn>;
        assistRadius: number;
        remoteRadius: number;
        basePlan?: BasePlanData;
        attackTarget?: string;
    }

    interface NodeJS {
        log: any;
    }
}

export const loop = ErrorMapper.wrapLoop(() => {
    const startCpu = Game.cpu.getUsed();

    clearStalePaths();

    runMigrations();

    if (!Memory.tasks) {
        Memory.tasks = [];
    }

    if (!Memory.creeps) {
        Memory.creeps = {};
    }

    if (!Memory.rooms) {
        Memory.rooms = {};
    }

    const rooms = Object.values(Game.rooms);

    const taskManager = new TaskManager();

    for (const name in Memory.creeps) {
        if (!(name in Game.creeps)) {
            const creepMemory = Memory.creeps[name];

            if (creepMemory.taskId) {
                const task = taskManager.get(creepMemory.taskId);
                task?.removeDeadCreep(name);
            }

            delete Memory.creeps[name];
        }
    }

    const myCreeps = Object.values(Game.creeps);

    for (const creep of myCreeps) {
        if (creep.memory === undefined || creep.memory.ownerRoom === undefined) {
            creep.memory = getDefaultCreepMemory(creep.room.name);
        }
    }

    const myCreepStates = myCreeps.map(creep => new CreepState(creep, getCreepMemory(creep.name)));

    const world = new World(rooms, myCreepStates, taskManager);

    runPlans(world);
    taskManager.pruneInvalid();

    const spawnManager = new SpawnManager();
    spawnManager.run(world);

    logEconomyStatus(world);

    assignCreeps(world);
    performTowerDefense(world);
    performCreepActions(world);

    Memory.creeps = world.getCreepData();
    Memory.tasks = world.getTaskData();

    const totalCpu = Game.cpu.getUsed() - startCpu;
    Memory.cpuAvg = (Memory.cpuAvg ?? totalCpu) * 0.9 + totalCpu * 0.1;
    console.log(`CPU: ${totalCpu.toFixed(1)} avg:${Memory.cpuAvg.toFixed(1)} bucket:${Game.cpu.bucket}`);

    trackCpuUsage();
});
