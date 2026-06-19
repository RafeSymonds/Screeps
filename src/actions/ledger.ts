/**
 * LogisticsLedger — the per-tick reservation tracker that turns independent,
 * herding energy routing into coordinated assignment.
 *
 * The problem it solves: each creep used to pick its energy source/sink by a
 * private argmax, blind to what every other creep was already going for. So they
 * all chased the same nearest pile (enough for one), and the rest arrived to
 * nothing. The ledger records, per target, how much energy is already spoken for
 * by creeps currently heading there. A new picker then scores against what is
 * LEFT (`remaining = available − reserved`), so a claimed source looks empty and
 * it routes to the next-best stash instead.
 *
 * It is rebuilt every tick from creep memory (`srcTargetId` / `sinkTargetId`) and
 * holds no persistent state of its own — self-healing across global resets, no
 * migration. Per the agreed design we assume a creep takes/gives a FULL load
 * (its free capacity when gathering, its carried energy when delivering), capped
 * by what the target can actually supply/accept.
 */

import { World } from "world/World";

export class LogisticsLedger {
    private readonly reservations = new Map<string, number>();

    /** Energy already claimed on `id` by creeps en route to it (0 if none). */
    public reserved(id: string | undefined): number {
        if (!id) {
            return 0;
        }
        return this.reservations.get(id) ?? 0;
    }

    /** Add a claim. Re-picking creeps call this so later creeps this tick see it. */
    public claim(id: string, amount: number): void {
        if (amount <= 0) {
            return;
        }
        this.reservations.set(id, (this.reservations.get(id) ?? 0) + amount);
    }
}

/** Minimal structural view of an energy target the ledger needs to size a claim. */
interface LedgerTarget {
    amount?: number;
    resourceType?: ResourceConstant;
    store?: {
        getUsedCapacity(resource: ResourceConstant): number | null;
        getFreeCapacity(resource: ResourceConstant): number | null;
    };
}

/** Energy a creep could draw from `obj` right now (dropped pile or store). */
function sourceAvailable(obj: LedgerTarget): number {
    if (typeof obj.amount === "number" && obj.resourceType !== undefined) {
        return obj.resourceType === RESOURCE_ENERGY ? obj.amount : 0;
    }
    return obj.store?.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
}

/** Free energy space in `obj` right now (a delivery sink). */
function sinkFree(obj: LedgerTarget): number {
    return obj.store?.getFreeCapacity(RESOURCE_ENERGY) ?? 0;
}

/**
 * Build this tick's ledger by summing the committed load of every live creep that
 * currently holds an energy target. A creep's phase (`working`) decides which
 * target it is committed to and how much it reserves: a gatherer claims up to its
 * free capacity from its source; a deliverer claims up to its carried energy into
 * its sink. Each claim is capped at what the target can actually supply/accept, so
 * a depleted or vanished target contributes nothing (it self-corrects next tick).
 */
export function buildLedger(world: World): LogisticsLedger {
    const ledger = new LogisticsLedger();
    for (const creep of world.creeps) {
        if (creep.spawning) {
            continue;
        }
        const gathering = creep.memory.working !== true;
        const id = gathering ? creep.memory.srcTargetId : creep.memory.sinkTargetId;
        if (!id) {
            continue;
        }
        const obj = Game.getObjectById(id as Id<_HasId>) as unknown as LedgerTarget | null;
        if (!obj) {
            continue;
        }
        if (gathering) {
            const load = Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), sourceAvailable(obj));
            ledger.claim(id, load);
        } else {
            const load = Math.min(creep.store.getUsedCapacity(RESOURCE_ENERGY), sinkFree(obj));
            ledger.claim(id, load);
        }
    }
    return ledger;
}
