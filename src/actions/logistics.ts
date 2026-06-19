/**
 * Energy logistics policy. The single place that decides WHAT a creep should
 * draw from, deliver to, or build. Every choice is an
 * argmax(base + deliverable·amountWeight − distance·distWeight): distance is one
 * term in a blended score, not a gate, and the deliverable term — how much energy
 * this creep can actually take/give after OTHER creeps' reservations are netted
 * out (see LogisticsLedger) — is what dominates. That is what stops the whole
 * workforce from herding onto the nearest small pile.
 *
 * Two layers:
 *   - `pickEnergySource` / `pickEnergySink` / `pickBuildSite` are pure scorers
 *     (creep + room + ledger in, target out) so they unit test without the engine.
 *   - `resolveEnergySource` / `resolveEnergySink` add STICKINESS on top: a creep
 *     keeps its committed target across ticks (revalidating it) and only re-scores
 *     when the target is gone/empty/full, then records its claim in the ledger.
 *     The executors call the resolvers; tests can call either layer.
 *
 * Tunables live in config/constants.
 */

import {
    LOGISTICS_BUILD_DEFAULT_PRIORITY,
    LOGISTICS_BUILD_PRIORITY,
    LOGISTICS_BUILD_PRIORITY_SCALE,
    LOGISTICS_BUILD_PROGRESS_WEIGHT,
    LOGISTICS_DIST_WEIGHT,
    LOGISTICS_SINK_AMOUNT_WEIGHT,
    LOGISTICS_SINK_EXTENSION,
    LOGISTICS_SINK_FILL_URGENCY,
    LOGISTICS_SINK_SPAWN,
    LOGISTICS_SINK_TOWER,
    LOGISTICS_SOURCE_AMOUNT_WEIGHT,
    LOGISTICS_SOURCE_CONTAINER,
    LOGISTICS_SOURCE_DROPPED,
    LOGISTICS_SOURCE_STORAGE,
    LOGISTICS_TOWER_COMBAT_MULT
} from "config/constants";
import { LogisticsLedger } from "actions/ledger";
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

export type EnergySink = StructureSpawn | StructureExtension | StructureTower;

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
 * (when allowed) storage. Spawns/extensions are never sources. Each candidate is
 * scored by its deliverable load — `min(free capacity, available − reserved)` —
 * so a source already claimed by other creeps, or one too small to be worth the
 * trip, loses to a fuller one even if it is farther. Returns the intent + target,
 * or undefined when nothing has deliverable energy.
 */
export function pickEnergySource(
    creep: Creep,
    room: WorldRoom,
    ledger: LogisticsLedger,
    opts: PickSourceOpts = {}
): EnergySource | undefined {
    const allowStorage = opts.allowStorage ?? true;
    const freeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);
    let best: EnergySource | undefined;
    let bestScore = -Infinity;

    const consider = (source: EnergySource, base: number, pos: RoomPosition, available: number): void => {
        const remaining = available - ledger.reserved(source.target.id);
        const deliverable = Math.min(freeCapacity, remaining);
        if (deliverable <= 0) {
            return;
        }
        const value =
            base + deliverable * LOGISTICS_SOURCE_AMOUNT_WEIGHT - creep.pos.getRangeTo(pos) * LOGISTICS_DIST_WEIGHT;
        if (value > bestScore) {
            bestScore = value;
            best = source;
        }
    };

    for (const pile of room.droppedEnergy) {
        consider({ kind: EnergySourceKind.Pickup, target: pile }, LOGISTICS_SOURCE_DROPPED, pile.pos, pile.amount);
    }
    for (const container of room.containers) {
        const available = container.store.getUsedCapacity(RESOURCE_ENERGY);
        if (available > 0) {
            consider(
                { kind: EnergySourceKind.Withdraw, target: container },
                LOGISTICS_SOURCE_CONTAINER,
                container.pos,
                available
            );
        }
    }
    if (allowStorage && room.storage) {
        const available = room.storage.store.getUsedCapacity(RESOURCE_ENERGY);
        if (available > 0) {
            consider(
                { kind: EnergySourceKind.Withdraw, target: room.storage },
                LOGISTICS_SOURCE_STORAGE,
                room.storage.pos,
                available
            );
        }
    }

    return best;
}

/**
 * Best spawn/extension/tower for `creep` to refill. Value blends the structure's
 * base importance (scaled by how empty it is, towers boosted under attack) with
 * the deliverable DEPOSIT — how much of the creep's load this sink can take after
 * other creeps' reservations — so two creeps don't both target one half-full
 * extension. Returns undefined when nothing can accept (more of) the load.
 */
export function pickEnergySink(creep: Creep, room: WorldRoom, ledger: LogisticsLedger): EnergySink | undefined {
    const load = creep.store.getUsedCapacity(RESOURCE_ENERGY);
    let best: EnergySink | undefined;
    let bestScore = -Infinity;

    for (const sink of room.energySinks()) {
        const free = sink.store.getFreeCapacity(RESOURCE_ENERGY) - ledger.reserved(sink.id);
        const deposit = Math.min(load, free);
        if (deposit <= 0) {
            continue;
        }
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
        const value =
            base + deposit * LOGISTICS_SINK_AMOUNT_WEIGHT - creep.pos.getRangeTo(sink.pos) * LOGISTICS_DIST_WEIGHT;
        if (value > bestScore) {
            bestScore = value;
            best = sink;
        }
    }

    return best;
}

/**
 * Sticky source selection: keep the creep's committed source while it still holds
 * energy (the holder has first claim, so it revalidates on raw availability, not
 * the reserved remainder — it never abandons a source just because others queued
 * behind it). Only when the held target is gone/empty does it re-pick the best
 * open source and record the claim so the rest of this tick routes around it.
 */
export function resolveEnergySource(
    creep: Creep,
    room: WorldRoom,
    ledger: LogisticsLedger,
    opts: PickSourceOpts = {}
): EnergySource | undefined {
    const held = heldSource(creep, room, opts.allowStorage ?? true);
    if (held) {
        return held; // already reserved by buildLedger; do not double-count
    }
    delete creep.memory.srcTargetId;

    const pick = pickEnergySource(creep, room, ledger, opts);
    if (!pick) {
        return undefined;
    }
    creep.memory.srcTargetId = pick.target.id;
    const available = sourceAvailable(pick.target);
    ledger.claim(pick.target.id, Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), available));
    return pick;
}

/** Sticky sink selection — the delivery mirror of {@link resolveEnergySource}. */
export function resolveEnergySink(creep: Creep, room: WorldRoom, ledger: LogisticsLedger): EnergySink | undefined {
    const held = heldSink(creep, room);
    if (held) {
        return held;
    }
    delete creep.memory.sinkTargetId;

    const pick = pickEnergySink(creep, room, ledger);
    if (!pick) {
        return undefined;
    }
    creep.memory.sinkTargetId = pick.id;
    const free = pick.store.getFreeCapacity(RESOURCE_ENERGY);
    ledger.claim(pick.id, Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), free));
    return pick;
}

/** The creep's currently-committed source as an intent, if it still has energy. */
function heldSource(creep: Creep, room: WorldRoom, allowStorage: boolean): EnergySource | undefined {
    const id = creep.memory.srcTargetId;
    if (!id) {
        return undefined;
    }
    for (const pile of room.droppedEnergy) {
        if (pile.id === id && pile.amount > 0) {
            return { kind: EnergySourceKind.Pickup, target: pile };
        }
    }
    for (const container of room.containers) {
        if (container.id === id && container.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
            return { kind: EnergySourceKind.Withdraw, target: container };
        }
    }
    if (allowStorage && room.storage && room.storage.id === id && room.storage.store.getUsedCapacity(RESOURCE_ENERGY) > 0) {
        return { kind: EnergySourceKind.Withdraw, target: room.storage };
    }
    return undefined;
}

/** The creep's currently-committed sink, if it still has free capacity. */
function heldSink(creep: Creep, room: WorldRoom): EnergySink | undefined {
    const id = creep.memory.sinkTargetId;
    if (!id) {
        return undefined;
    }
    for (const sink of room.energySinks()) {
        if (sink.id === id && sink.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
            return sink;
        }
    }
    return undefined;
}

/** Energy currently available to draw from a chosen source target. */
function sourceAvailable(target: Resource | StructureContainer | StructureStorage): number {
    if ("amount" in target) {
        return target.amount;
    }
    return target.store.getUsedCapacity(RESOURCE_ENERGY);
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
