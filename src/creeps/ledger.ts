/**
 * Per-tick energy reservation ledger — stops N creeps converging on one pile.
 * See docs/design/creeps.md.
 *
 * ## The problem
 *
 * Every executor picks its collection target by looking at the world, and the
 * world looks identical to all of them. Ten empty creeps evaluating the same
 * 30-energy pile all choose it, all walk there, and the first to arrive takes the
 * lot — the other nine spent the trip for nothing and then re-decide, together,
 * on the next pile. Field-reported exactly that way: "10 creeps to pick up 30
 * energy, one picks it all up and then they all go back."
 *
 * Pure statelessness is what causes it. Each creep is individually correct and
 * the fleet is collectively stupid, because nobody can see what the others just
 * decided *this tick*.
 *
 * ## The fix
 *
 * A ledger, alive for exactly one tick. When a creep commits to a source of
 * energy it claims the amount it can actually carry; later creeps deciding in the
 * same tick see the remainder and move on to something else. A 30-energy pile
 * satisfies one 50-capacity hauler and then reads as empty, so the other nine
 * look elsewhere.
 *
 * This is deliberately NOT persisted. A reservation is only meaningful within the
 * tick that created it — carrying it across ticks would mean tracking whether the
 * creep actually arrived, which is the stale-task bookkeeping the whole executor
 * design exists to avoid. Re-deciding from scratch every tick, with a fresh
 * ledger, is both simpler and self-healing.
 */

export interface EnergyLedger {
    /** How much of `id` is still unspoken for this tick. */
    remaining(id: string, amount: number): number;
    /** Reserve `amount` of `id` for the creep that just chose it. */
    claim(id: string, amount: number): void;
}

export function createLedger(): EnergyLedger {
    const claimed = new Map<string, number>();
    return {
        remaining: (id, amount) => Math.max(0, amount - (claimed.get(id) ?? 0)),
        claim: (id, amount) => claimed.set(id, (claimed.get(id) ?? 0) + Math.max(0, amount))
    };
}

/**
 * A ledger that reserves nothing — every creep sees the full amount.
 * The default for unit tests and any caller deciding for a single creep, where
 * contention cannot arise.
 */
export const NULL_LEDGER: EnergyLedger = {
    remaining: (_id, amount) => amount,
    claim: () => undefined
};
