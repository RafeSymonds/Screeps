import { World } from "world/World";
import { TaskKind } from "tasks/core/TaskKind";
import { RoomSpawnStats } from "memory/types";

export interface EconomySnapshot {
    room: string;
    rcl: number;
    storageEnergy: number;
    sources: number;
    spawnPressure: {
        mine: number;
        carry: number;
        work: number;
    };
    upgrading: {
        desiredParts: number;
        pressurePenalty: number;
        storageEnergy: number;
    };
    buildQueue: number;
    tasks: {
        harvest: number;
        deliver: number;
        upgrade: number;
        build: number;
    };
}

export function logEconomyStatus(world: World): void {
    const snapshots: EconomySnapshot[] = [];

    for (const [, worldRoom] of world.rooms) {
        const room = worldRoom.room;
        if (!room.controller?.my) continue;

        const stats = room.memory.spawnStats;
        const tasks = world.taskManager.getTasksForRoom(room);

        let harvestCount = 0;
        let deliverCount = 0;
        let upgradeCount = 0;
        let buildCount = 0;

        for (const task of tasks) {
            const kind = task.type();
            if (kind === TaskKind.HARVEST) harvestCount++;
            else if (kind === TaskKind.DELIVER) deliverCount++;
            else if (kind === TaskKind.UPGRADE) upgradeCount++;
            else if (kind === TaskKind.BUILD) buildCount++;
        }

        const storageEnergy = room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
        const sources = room.find(FIND_SOURCES).length;

        const pressurePenalty =
            (stats?.mine.pressure ?? 0) + (stats?.carry.pressure ?? 0) + (stats?.work.pressure ?? 0);

        let desiredParts = Math.max(10, (room.controller?.level ?? 1) * 10);
        if (storageEnergy < 1000 && !room.storage) desiredParts = 4;
        else if (storageEnergy < 500 && room.storage) desiredParts = 1;
        else if (pressurePenalty > 1.2) desiredParts = Math.max(1, Math.floor(desiredParts * 0.2));
        else if (pressurePenalty > 0.8) desiredParts = Math.max(1, Math.floor(desiredParts * 0.5));
        else if (storageEnergy > 5000) desiredParts *= 2;

        snapshots.push({
            room: room.name,
            rcl: room.controller?.level ?? 0,
            storageEnergy,
            sources,
            spawnPressure: {
                mine: stats?.mine.pressure ?? 0,
                carry: stats?.carry.pressure ?? 0,
                work: stats?.work.pressure ?? 0
            },
            upgrading: {
                desiredParts,
                pressurePenalty,
                storageEnergy
            },
            buildQueue: room.find(FIND_CONSTRUCTION_SITES).length,
            tasks: {
                harvest: harvestCount,
                deliver: deliverCount,
                upgrade: upgradeCount,
                build: buildCount
            }
        });
    }

    for (const s of snapshots) {
        const mineP = s.spawnPressure.mine.toFixed(2);
        const carryP = s.spawnPressure.carry.toFixed(2);
        const workP = s.spawnPressure.work.toFixed(2);
        console.log(
            `[${s.room}] RCL${s.rcl} E${s.storageEnergy} S${s.sources} ` +
                `Press(m/c/w):${mineP}/${carryP}/${workP} ` +
                `Upg:${s.upgrading.desiredParts}W ` +
                `Tasks(H/D/U/B):${s.tasks.harvest}/${s.tasks.deliver}/${s.tasks.upgrade}/${s.tasks.build} ` +
                `Sites:${s.buildQueue}`
        );
    }
}

export function roomExpansionReadiness(
    room: Room,
    cpuBucket: number,
    stats: RoomSpawnStats | undefined
): { ready: boolean; reason: string } {
    const MIN_BUCKET = 3000;
    const MIN_STORAGE_ENERGY = 50000;
    const MIN_HEALTHY_PRESSURE = 0.5;
    const MIN_RCL = 4;

    if (Game.gcl.level <= Object.keys(Memory.rooms).length) {
        return { ready: false, reason: "GCL limit" };
    }

    if (cpuBucket < MIN_BUCKET) {
        return { ready: false, reason: `CPU bucket ${cpuBucket} < ${MIN_BUCKET}` };
    }

    if ((room.controller?.level ?? 0) < MIN_RCL) {
        return { ready: false, reason: `RCL ${room.controller?.level} < ${MIN_RCL}` };
    }

    const storageEnergy = room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    if (storageEnergy < MIN_STORAGE_ENERGY) {
        return { ready: false, reason: `Storage ${storageEnergy} < ${MIN_STORAGE_ENERGY}` };
    }
    const pressure = (stats?.mine.pressure ?? 0) + (stats?.carry.pressure ?? 0) + (stats?.work.pressure ?? 0);
    if (pressure > MIN_HEALTHY_PRESSURE && stats !== undefined) {
        return { ready: false, reason: `Pressure ${pressure.toFixed(2)} > ${MIN_HEALTHY_PRESSURE}` };
    }

    const growth = room.memory.growth;
    if (!growth?.expansionReady) {
        return { ready: false, reason: "Growth not ready" };
    }

    return { ready: true, reason: "OK" };
}
