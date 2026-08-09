/**
 * Body formulas — scale with spawn capacity, bounded only by the game's 50-part
 * limit. Bigger bodies mean fewer creeps and fewer intents (principle 8).
 * See docs/design/economy.md "Workforce model".
 */

export const MAX_BODY_PARTS = 50;

export function bodyCost(body: BodyPartConstant[]): number {
    return body.reduce((sum, part) => sum + BODYPART_COST[part], 0);
}

function repeat(part: BodyPartConstant, count: number): BodyPartConstant[] {
    return new Array<BodyPartConstant>(count).fill(part);
}

/** Maximize WORK with 1 MOVE per 5 WORK. Floor [W,W,M] = 250; min viable [W,M]. */
export function minerBody(capacity: number): BodyPartConstant[] {
    let best = { work: 2, move: 1 };
    for (let work = 2; ; work++) {
        const move = Math.ceil(work / 5);
        if (work + move > MAX_BODY_PARTS || work * 100 + move * 50 > capacity) {
            break;
        }
        best = { work, move };
    }
    return [...repeat(WORK, best.work), ...repeat(MOVE, best.move)];
}

export const MINER_MIN_BODY: BodyPartConstant[] = [WORK, MOVE];

/** [C,M] pairs, max(2, floor(cap/100)), only the 50-part limit caps it (25 pairs). */
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
