/**
 * Expansion tunables — one named config. See docs/design/expansion.md.
 */
export interface ExpansionConfig {
    pioneers: number;
    /** M6 scouts only reach adjacent rooms, so intel only ever holds distance-1
     *  candidates — a larger range is dead spec until M7's deeper rotation. */
    maxRange: number;
    scoreThreshold: number;
    /** A fresh claim gets 20,001 ticks before level-1 expiry UNCLAIMS the room
     *  outright — 20k was a post-mortem, not a warning. */
    pioneerTimeout: number;
    claimerDeathLimit: number;
    claimCooldown: number;
    /** A [CLAIM,MOVE] body costs 650: below this the demand head-of-line-blocks
     *  the sponsor's whole queue forever. */
    minSponsorCap: number;
}

export const EXPANSION_CONFIG: ExpansionConfig = {
    pioneers: 3,
    maxRange: 1,
    scoreThreshold: 20,
    pioneerTimeout: 6000,
    claimerDeathLimit: 2,
    claimCooldown: 5000,
    minSponsorCap: 650
};

/** Claim/pioneer demands sit in the live band (remotes' tier): a claim IS the
 *  strategy, so it outranks upgrading, and small bodies keep stalls short. */
export const PRIORITY_CLAIMER = 60;
export const PRIORITY_PIONEER = 65;
