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
export function minerBody(capacity: number, withLink = false): BodyPartConstant[] {
    const carry = withLink ? 1 : 0;
    let best = { work: 1, move: 1 };
    for (let work = 1; ; work++) {
        const move = Math.ceil(work / 5);
        if (work + move + carry > MAX_BODY_PARTS || work * 100 + carry * 50 + move * 50 > capacity) {
            break;
        }
        best = { work, move };
    }
    return [
        ...repeat(WORK, best.work),
        ...repeat(CARRY, carry),
        ...repeat(MOVE, best.move)
    ];
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

export function haulerCarryCapacity(capacity: number): number {
    return haulerBody(capacity).filter(p => p === CARRY).length * CARRY_CAPACITY;
}

/** [W,W,C,M] units (300 each, 2 WORK), max(1, floor(cap/300)), 50-part limit (12 units). */
export function upgraderBody(capacity: number): BodyPartConstant[] {
    const units = Math.min(12, Math.max(1, Math.floor(capacity / 300)));
    return [...repeat(WORK, units * 2), ...repeat(CARRY, units), ...repeat(MOVE, units)];
}

/** [W,C,C,M] units (250 each, 1 WORK = 5 build-e/t), max(1, floor(cap/250)), 50-part limit. */
export function builderBody(capacity: number): BodyPartConstant[] {
    const units = Math.min(12, Math.max(1, Math.floor(capacity / 250)));
    return [...repeat(WORK, units), ...repeat(CARRY, units * 2), ...repeat(MOVE, units)];
}
