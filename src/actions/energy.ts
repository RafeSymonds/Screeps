import { harvest, pickup, withdraw } from "actions/primitives";
import { WorldRoom } from "world/WorldRoom";

/**
 * Shared energy logistics used by the sink executors (upgrade/build). Priority:
 * dropped energy (decays, grab it first) -> containers/storage -> harvest a
 * source directly. This is the composite that bootstrap generalists rely on.
 */
export function acquireEnergy(creep: Creep, worldRoom: WorldRoom): void {
    if (worldRoom.droppedEnergy.length > 0) {
        const pile = creep.pos.findClosestByRange(worldRoom.droppedEnergy);
        if (pile) {
            pickup(creep, pile);
            return;
        }
    }

    const stores = worldRoom.energyStores();
    if (stores.length > 0) {
        const store = creep.pos.findClosestByRange(stores);
        if (store) {
            withdraw(creep, store);
            return;
        }
    }

    const activeSources = worldRoom.sources.filter(source => source.energy > 0);
    const source = creep.pos.findClosestByRange(activeSources) ?? worldRoom.sources[0];
    if (source) {
        harvest(creep, source);
    }
}

/** Closest spawn/extension/tower that still needs energy. */
export function nearestEnergySink(creep: Creep, worldRoom: WorldRoom): Structure | undefined {
    return creep.pos.findClosestByRange(worldRoom.energySinks()) ?? undefined;
}
