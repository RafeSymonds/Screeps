import { harvest, pickup, withdraw } from "actions/primitives";
import { LogisticsLedger } from "actions/ledger";
import { WorldRoom } from "world/WorldRoom";
import { EnergySourceKind, resolveEnergySource } from "actions/logistics";
import { countOpenSeats } from "jobs/generators/HarvestJobGenerator";

/**
 * Shared energy gathering for the sink executors (build/upgrade/repair) and
 * bootstrap generalists. Delegates source selection to the sticky, reservation-
 * aware logistics policy (dropped/containers/storage), then falls back to
 * harvesting a source directly when nothing is staged — the path a fresh room
 * relies on. Spenders may always draw from storage; the scorer's storage gate is
 * for haulers only.
 */
export function acquireEnergy(creep: Creep, worldRoom: WorldRoom, ledger: LogisticsLedger): void {
    const staged = resolveEnergySource(creep, worldRoom, ledger);
    if (staged) {
        if (staged.kind === EnergySourceKind.Pickup) {
            pickup(creep, staged.target);
        } else {
            withdraw(creep, staged.target);
        }
        return;
    }

    const source = closestSourceWithSeat(creep, worldRoom);
    if (source) {
        harvest(creep, source);
    }
}

/**
 * The closest source to mine directly, preferring one that still has a free seat so a
 * swarm of energy-hungry workers doesn't pile onto the nearest source past its
 * walkable openings (a source already worked by a dedicated miner counts as
 * occupied). Falls back to the plain closest source when every one is full or empty —
 * better to crowd than to stall.
 */
function closestSourceWithSeat(creep: Creep, worldRoom: WorldRoom): Source | undefined {
    const active = worldRoom.sources.filter(source => source.energy > 0);
    const candidates = active.length > 0 ? active : worldRoom.sources;
    let withSeat: Source | undefined;
    let withSeatRange = Infinity;
    let any: Source | undefined;
    let anyRange = Infinity;
    for (const source of candidates) {
        const range = creep.pos.getRangeTo(source.pos);
        if (range < anyRange) {
            any = source;
            anyRange = range;
        }
        const occupied = source.pos.findInRange(FIND_MY_CREEPS, 1).length;
        if (occupied < countOpenSeats(source) && range < withSeatRange) {
            withSeat = source;
            withSeatRange = range;
        }
    }
    return withSeat ?? any;
}
