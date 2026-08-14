/**
 * Body formulas — scale with spawn capacity, bounded only by the game's 50-part
 * limit. Bigger bodies mean fewer creeps and fewer intents (principle 8).
 * See docs/design/economy.md "Workforce model".
 *
 * ## Why bigger is better, up to the part limit
 *
 * Every creep action costs 0.2 CPU regardless of how much it accomplishes, so one
 * 10-WORK miner harvesting 20 e/t costs a fifth of what five 2-WORK miners cost to
 * do the same job. Bodies scale with the room's energy capacity rather than being
 * fixed, so a room's creeps get better as it grows without any policy change.
 *
 * The part ratios encode movement: a creep needs 1 MOVE per 2 other parts to move
 * at full speed on plains, but a miner that walks once and then sits for 1500
 * ticks does not care about speed, which is why it takes 1 MOVE per 5 WORK and
 * spends the savings on more WORK. Haulers, which move constantly, pay the full
 * 1:1 rate.
 */

export const MAX_BODY_PARTS = 50;

export function bodyCost(body: BodyPartConstant[]): number {
    return body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
}

function repeat(part: BodyPartConstant, count: number): BodyPartConstant[] {
    return new Array<BodyPartConstant>(count).fill(part);
}

/**
 * Maximize WORK with 1 MOVE per 5 WORK. **No CARRY**: a miner only mines, and
 * harvest overflow drops straight into the container it stands on (engine
 * `_create-energy`), so carrying capacity buys no throughput — it costs 50
 * energy and a body slot that could be WORK, and it parks 50 energy inside the
 * creep where nothing can spend it. Container upkeep moves to the builder crew,
 * which has ~25,000 ticks of slack: a container decays 10 hits/tick against
 * 250k, far beyond a miner's 1500-tick life.
 *
 * The one exception is `withLink` — a source served by a link needs someone to
 * put energy INTO it, and that is the miner standing beside it (economy.md
 * "Links"). Exactly one CARRY, only there.
 */
export function minerBody(
    capacity: number,
    opts: { withLink?: boolean; maxWork?: number; travelTiles?: number } = {}
): BodyPartConstant[] {
    const ceiling = opts.maxWork ?? Infinity;
    let best = { work: 1, carry: linkCarryFor(1, opts.withLink), move: 1 };
    for (let work = 1; work <= ceiling; work++) {
        const carry = linkCarryFor(work, opts.withLink);
        const move = minerMoveFor(work + carry, opts.travelTiles);
        if (work + move + carry > MAX_BODY_PARTS || work * 100 + carry * 50 + move * 50 > capacity) {
            break;
        }
        best = { work, carry, move };
    }
    return [...repeat(WORK, best.work), ...repeat(CARRY, best.carry), ...repeat(MOVE, best.move)];
}

/**
 * A miner walks once and then sits for the rest of its life, so it takes 1 MOVE
 * per 5 other parts and spends the savings on WORK — right up until the walk is
 * long, at which point that ratio is a disaster.
 *
 * Fatigue is 2 per non-MOVE part per tile (plains) against 2 removed per MOVE
 * part per tick, so speed is `move / nonMove` tiles per tick. A [W×5, M×1] remote
 * miner therefore moves one tile every five ticks: **625 ticks to reach a room two
 * borders away**, 42% of its life, and — the reason this was found — its haulers
 * arrive in 125 and then shuttle nothing for five hundred ticks (sim-observed:
 * eight haulers, zero miners, source untouched).
 *
 * So MOVE is bought against the trip rather than fixed: enough that travel is a
 * small slice of a creep's life, never fewer than the sit-still ratio, never more
 * than full speed. The energy is trivially repaid — 200 extra energy of MOVE buys
 * ~500 extra ticks of mining at 10 e/t.
 */
const MINER_TRAVEL_BUDGET_TICKS = 150;

function minerMoveFor(nonMoveParts: number, travelTiles?: number): number {
    const parked = Math.ceil(nonMoveParts / 5);
    if (travelTiles === undefined || travelTiles <= 0) {
        return parked;
    }
    const forTravel = Math.ceil((nonMoveParts * travelTiles) / MINER_TRAVEL_BUDGET_TICKS);
    return Math.min(nonMoveParts, Math.max(parked, forTravel));
}

/**
 * CARRY for a miner feeding a link. One is enough to make the transfer *possible*
 * and much too little to make it cheap: a 10-WORK miner harvests 20 energy a tick,
 * so a 50-capacity store fills in 2.5 ticks and the miner spends an intent — a
 * flat 0.2 CPU — every third tick for its whole life. Sizing the store to about ten
 * ticks of harvest cuts that by 4×, for 50 energy a part.
 */
function linkCarryFor(work: number, withLink?: boolean): number {
    if (withLink !== true) {
        return 0;
    }
    const perTick = work * HARVEST_POWER;
    return Math.max(1, Math.ceil((perTick * 10) / CARRY_CAPACITY));
}

export const MINER_MIN_BODY: BodyPartConstant[] = [WORK, MOVE];

/** [C,M] pairs, max(2, floor(cap/100)), only the 50-part limit caps it (25 pairs).
 *  1:1 CARRY:MOVE keeps a hauler at full speed even loaded — a hauler that halves
 *  its speed when full has doubled its round trip, which is the whole metric. */
export function haulerBody(capacity: number): BodyPartConstant[] {
    const pairs = Math.min(MAX_BODY_PARTS / 2, Math.max(2, Math.floor(capacity / 100)));
    return [...repeat(CARRY, pairs), ...repeat(MOVE, pairs)];
}

export const HAULER_MIN_BODY: BodyPartConstant[] = [CARRY, MOVE];

/**
 * A hauler sized to carry exactly `carry` energy, never more than `capacity`
 * affords.
 *
 * Always building max-size haulers and rounding the COUNT up over-provisions
 * badly once creeps are large: a room needing 1050 carry at capacity 1800 rounds
 * 1.16 haulers up to 2, and gets 2 × 900 = 1800 carry — 72 body parts doing the
 * work of 1.16, paid for in energy every 1500 ticks and in CPU every tick. Bigger
 * is better per-creep (principle 8), but only up to what the room actually needs;
 * past that it is waste wearing the shape of efficiency.
 *
 * So the planner picks the minimum number of haulers, then divides the required
 * throughput among them and asks for exactly that.
 */
export function haulerBodyForCarry(carry: number, capacity: number): BodyPartConstant[] {
    const affordable = Math.min(MAX_BODY_PARTS / 2, Math.max(1, Math.floor(capacity / 100)));
    const wanted = Math.max(1, Math.ceil(carry / CARRY_CAPACITY));
    const pairs = Math.min(affordable, wanted);
    return [...repeat(CARRY, pairs), ...repeat(MOVE, pairs)];
}

export function haulerCarryCapacity(capacity: number): number {
    return haulerBody(capacity).filter(p => p === CARRY).length * CARRY_CAPACITY;
}

/**
 * [W,C,M] units (200 each) — THE worker body. One role builds, upgrades and (in a
 * room with no logistics yet) harvests for itself, so one body has to serve all
 * three. 1:1:1 is the honest compromise: WORK sets both build and upgrade
 * throughput, CARRY sets how much a trip to a distant site is worth, and 1 MOVE
 * per 2 other parts keeps it at full speed on roads.
 *
 * Separate builder/upgrader bodies were a false economy — they optimised for a
 * role split the planner could not predict, and a creep lives 1500 ticks while
 * the construction queue turns over in a few hundred.
 */
export function workerBody(capacity: number): BodyPartConstant[] {
    const units = Math.min(16, Math.max(1, Math.floor(capacity / 200)));
    return [...repeat(WORK, units), ...repeat(CARRY, units), ...repeat(MOVE, units)];
}

/**
 * ## Leftover capacity: spending it is UNVERIFIED, not disproven (Aug 2026)
 *
 * The 200-energy unit leaves a remainder at most capacities — 150 of 550 at RCL2 —
 * and spending it on a [WORK, MOVE] pair looks free: +50% throughput, same MOVE
 * ratio, same creep slot. It was implemented and then backed out during a
 * regression hunt on the `raid-early` gate. **It was not the cause** — bisection
 * pinned that on movement's cross-room ops cap (movement/config.ts) — so the honest
 * status is untested, not rejected.
 *
 * The reason it stays out for now is an argument, not a measurement: unspent
 * CAPACITY is not unspent energy. It is the room's ability to spawn the NEXT thing
 * soon, and a worker sized to the whole 550 empties the spawn and every extension.
 * Whether that costs more than the throughput gains is exactly the kind of question
 * the sim can answer, and nobody has asked it yet.
 *
 * Early under-consumption — the thing this was reaching for — is mostly a
 * creep-slot problem regardless: at RCL1 small bodies mean ~14 of 20 slots go to
 * miners and haulers, leaving ~6 WORK against 20 e/t of production. It resolves as
 * capacity grows and logistics consolidates into fewer, bigger creeps.
 */

export const WORKER_MIN_BODY: BodyPartConstant[] = [WORK, CARRY, MOVE];
