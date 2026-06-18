/**
 * Energy logistics policy. The single place that decides WHAT a creep should
 * draw from, deliver to, or build — replacing the old hardcoded ladders and
 * findClosestByRange calls in the executors. Every choice is an
 * argmax(value − distance·weight): distance is one term in a blended score, not
 * a gate, so a closer-but-lesser target can beat a farther-but-greater one and
 * vice versa. Pure functions (creep + WorldRoom in, target out) so they unit
 * test without the engine. Tunables live in config/constants.
 */

import {
    LOGISTICS_BUILD_DEFAULT_PRIORITY,
    LOGISTICS_BUILD_PRIORITY,
    LOGISTICS_BUILD_PRIORITY_SCALE,
    LOGISTICS_BUILD_PROGRESS_WEIGHT,
    LOGISTICS_DIST_WEIGHT,
    LOGISTICS_DROPPED_AMOUNT_CAP,
    LOGISTICS_DROPPED_AMOUNT_WEIGHT,
    LOGISTICS_SINK_EXTENSION,
    LOGISTICS_SINK_FILL_URGENCY,
    LOGISTICS_SINK_SPAWN,
    LOGISTICS_SINK_TOWER,
    LOGISTICS_SOURCE_CONTAINER,
    LOGISTICS_SOURCE_DROPPED,
    LOGISTICS_SOURCE_STORAGE,
    LOGISTICS_TOWER_COMBAT_MULT
} from "config/constants";
import { WorldRoom } from "world/WorldRoom";

/** How a creep takes energy from a chosen source — the union discriminant. */
export enum EnergySourceKind {
    Pickup = "pickup",
    Withdraw = "withdraw"
}

/** A chosen energy source plus the intent needed to take from it. */
export type EnergySource =
    | { kind: EnergySourceKind.Pickup; target: Resource }
    | { kind: EnergySourceKind.Withdraw; target: StructureContainer | StructureStorage };

export interface PickSourceOpts {
    /**
     * Whether storage may be drained. Haulers gate this on a real sink need so
     * they never withdraw-then-redeposit the strategic reserve (ping-pong);
     * spenders (build/upgrade/repair) consume the energy and always may.
     * Defaults to true.
     */
    allowStorage?: boolean;
}

/**
 * Best place for `creep` to draw energy: dropped piles, mining containers, or
 * (when allowed) storage. Spawns/extensions are never sources. Returns the
 * intent + target, or undefined when nothing is available.
 */
export function pickEnergySource(creep: Creep, room: WorldRoom, opts: PickSourceOpts = {}): EnergySource | undefined {
    const allowStorage = opts.allowStorage ?? true;
    let best: EnergySource | undefined;
    let bestScore = -Infinity;

    const consider = (source: EnergySource, base: number, pos: RoomPosition): void => {
        const value = base - creep.pos.getRangeTo(pos) * LOGISTICS_DIST_WEIGHT;
        if (value > bestScore) {
            bestScore = value;
            best = source;
        }
    };

    for (const pile of room.droppedEnergy) {
        const amountBonus = Math.min(pile.amount * LOGISTICS_DROPPED_AMOUNT_WEIGHT, LOGISTICS_DROPPED_AMOUNT_CAP);
        consider({ kind: EnergySourceKind.Pickup, target: pile }, LOGISTICS_SOURCE_DROPPED + amountBonus, pile.pos);
    }
    for (const container of room.containers) {
        if (container.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            consider({ kind: EnergySourceKind.Withdraw, target: container }, LOGISTICS_SOURCE_CONTAINER, container.pos);
        }
    }
    if (allowStorage && room.storage && room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        consider({ kind: EnergySourceKind.Withdraw, target: room.storage }, LOGISTICS_SOURCE_STORAGE, room.storage.pos);
    }

    return best;
}

/**
 * Best spawn/extension/tower for `creep` to refill. Value is the structure's
 * base importance scaled by how empty it is, with towers boosted while hostiles
 * are present — so an empty spawn or a depleted tower-under-attack outranks a
 * nearer half-full extension. Returns undefined when nothing needs energy.
 */
export function pickEnergySink(
    creep: Creep,
    room: WorldRoom
): StructureSpawn | StructureExtension | StructureTower | undefined {
    let best: StructureSpawn | StructureExtension | StructureTower | undefined;
    let bestScore = -Infinity;

    for (const sink of room.energySinks()) {
        const capacity = sink.store.getCapacity(RESOURCE_ENERGY) ?? 0;
        const fillNeed = capacity > 0 ? sink.store.getFreeCapacity(RESOURCE_ENERGY) / capacity : 0;
        let base: number;
        switch (sink.structureType) {
            case STRUCTURE_SPAWN:
                base = LOGISTICS_SINK_SPAWN + LOGISTICS_SINK_FILL_URGENCY * fillNeed;
                break;
            case STRUCTURE_TOWER:
                base =
                    (LOGISTICS_SINK_TOWER + LOGISTICS_SINK_FILL_URGENCY * fillNeed) *
                    (room.hostiles.length > 0 ? LOGISTICS_TOWER_COMBAT_MULT : 1);
                break;
            default:
                base = LOGISTICS_SINK_EXTENSION + LOGISTICS_SINK_FILL_URGENCY * fillNeed;
                break;
        }
        const value = base - creep.pos.getRangeTo(sink.pos) * LOGISTICS_DIST_WEIGHT;
        if (value > bestScore) {
            bestScore = value;
            best = sink;
        }
    }

    return best;
}

/**
 * Best construction site for `creep` to build. Structure type dominates (finish
 * economy/defense structures before roads), near-complete sites break ties (so
 * we finish what we started instead of spreading thin), then proximity. Returns
 * undefined when there are no sites.
 */
export function pickBuildSite(creep: Creep, room: WorldRoom): ConstructionSite | undefined {
    let best: ConstructionSite | undefined;
    let bestScore = -Infinity;

    for (const site of room.constructionSites) {
        const priority = LOGISTICS_BUILD_PRIORITY[site.structureType] ?? LOGISTICS_BUILD_DEFAULT_PRIORITY;
        const progress = site.progressTotal > 0 ? site.progress / site.progressTotal : 0;
        const value =
            priority * LOGISTICS_BUILD_PRIORITY_SCALE +
            progress * LOGISTICS_BUILD_PROGRESS_WEIGHT -
            creep.pos.getRangeTo(site.pos) * LOGISTICS_DIST_WEIGHT;
        if (value > bestScore) {
            bestScore = value;
            best = site;
        }
    }

    return best;
}
