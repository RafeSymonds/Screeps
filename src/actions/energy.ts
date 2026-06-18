import { harvest, pickup, withdraw } from "actions/primitives";
import { WorldRoom } from "world/WorldRoom";
import { EnergySourceKind, pickEnergySource } from "actions/logistics";

/**
 * Shared energy gathering for the sink executors (build/upgrade/repair) and
 * bootstrap generalists. Delegates source selection to the scored logistics
 * policy (dropped/containers/storage), then falls back to harvesting a source
 * directly when nothing is staged — the path a fresh room relies on. Spenders
 * may always draw from storage; the scorer's storage gate is for haulers only.
 */
export function acquireEnergy(creep: Creep, worldRoom: WorldRoom): void {
    const staged = pickEnergySource(creep, worldRoom);
    if (staged) {
        if (staged.kind === EnergySourceKind.Pickup) {
            pickup(creep, staged.target);
        } else {
            withdraw(creep, staged.target);
        }
        return;
    }

    const activeSources = worldRoom.sources.filter(source => source.energy > 0);
    const source = creep.pos.findClosestByRange(activeSources) ?? worldRoom.sources[0];
    if (source) {
        harvest(creep, source);
    }
}
