/**
 * The pure expansion state machine: observation-driven phases (so a global reset
 * costs nothing) plus the demand emission. See docs/design/expansion.md.
 *
 * ## The arc
 *
 * Claiming a second room is the longest single operation the bot runs: pick a
 * target, walk a CLAIM creep there (possibly several rooms), take the controller,
 * then keep pioneers alive long enough to build a spawn from nothing — thousands
 * of ticks end to end, across an unknown number of global resets.
 *
 * ## Phases are observed, not remembered
 *
 * The slice records the target, the sponsor and a phase label, but the phase
 * *transitions* are driven by looking at the world: do we own the target's
 * controller (→ pioneering), does it have a spawn (→ done). Nothing depends on
 * having witnessed the moment it happened. A reset mid-claim is therefore free —
 * the next tick re-observes the same reality and reaches the same conclusion.
 *
 * The one thing that genuinely cannot be re-observed is claimer *death*: the
 * shell GCs a dead creep's memory the tick after it dies, so the recorded
 * `claimerName` is the only evidence the creep ever existed. That is why it is
 * persisted and the phases are not.
 *
 * ## Empire decides when, this decides where
 *
 * `wanted` comes from empire (GCL headroom, are existing rooms healthy). This
 * module never asks whether to grow — only which room, and whether the operation
 * in flight is still going well. Failure modes are deliberately asymmetric:
 * before the claim it aborts freely, but a room already claimed is never
 * abandoned, only alerted on. An abandoned claimed room decays to nothing.
 */
import { AssignmentKind } from "shared/assignments";
import { SpawnDemand } from "shared/spawning";
import { SubsystemId } from "shared/subsystems";
import { CreepView } from "shared/views";
import { EXPANSION_CONFIG, ExpansionConfig, PRIORITY_CLAIMER, PRIORITY_PIONEER } from "expansion/config";
import { eligible, ExpansionCandidate, scoreCandidate } from "expansion/score";

export enum ClaimPhase {
    Claiming = "claiming",
    Pioneering = "pioneering"
}

export interface ExpansionMemory {
    v: 1;
    claim?: {
        target: string;
        sponsor: string;
        phase: ClaimPhase;
        startedAt: number;
        claimerName?: string;
        claimerDeaths: number;
    };
    cooldownUntil?: number;
}

export interface ExpansionDecisionInput {
    slice: ExpansionMemory;
    /** empire.expansionWanted() — empire decides WHEN, we decide WHERE. */
    wanted: boolean;
    candidates: ExpansionCandidate[];
    ownedMinerals: MineralConstant[];
    /** Stable rooms that can actually fund a claimer. */
    sponsors: { name: string; cap: number }[];
    /** Live expansion-owned creeps. */
    roster: CreepView[];
    /** Observed from snapshot/intel — the phases are observation-driven. */
    targetMine: boolean;
    targetHasSpawn: boolean;
    time: number;
    config: ExpansionConfig;
}

export interface ExpansionDecision {
    start?: { target: string; sponsor: string };
    advance?: ClaimPhase;
    done?: boolean;
    abort?: string;
    claimerDied?: boolean;
    sponsorRepick?: string;
    timedOut?: boolean;
}

const nameOf = (c: CreepView): string => c.name;

/**
 * One tick of the expansion state machine. Returns *what changed*, not new state
 * — the adapter applies the decision to the slice, so this stays pure and every
 * branch is unit-testable from a plain input object.
 */
export function planExpansionDecision(input: ExpansionDecisionInput): ExpansionDecision {
    const { slice, wanted, candidates, ownedMinerals, sponsors, roster, targetMine, targetHasSpawn, time, config } = input;
    const claim = slice.claim;

    // --- Idle: pick a target when empire says grow -------------------------------
    if (!claim) {
        if (!wanted || (slice.cooldownUntil !== undefined && time < slice.cooldownUntil)) {
            return {};
        }
        const sponsor = sponsors.find(s => s.cap >= config.minSponsorCap);
        if (!sponsor) {
            return {}; // an unaffordable claimer would park the sponsor's queue
        }
        const best = candidates
            .filter(eligible)
            .map(c => ({ c, score: scoreCandidate(c, ownedMinerals) }))
            .filter(x => x.score >= config.scoreThreshold)
            .sort((a, b) => b.score - a.score || (a.c.roomName < b.c.roomName ? -1 : 1))[0];
        if (!best) {
            return {};
        }
        return { start: { target: best.c.roomName, sponsor: sponsor.name } };
    }

    // --- Sponsor health: a LOST sponsor leaves no registry entry at all ----------
    const sponsorOk = sponsors.some(s => s.name === claim.sponsor && s.cap >= config.minSponsorCap);
    const decision: ExpansionDecision = {};
    if (!sponsorOk) {
        const replacement = sponsors.find(s => s.cap >= config.minSponsorCap);
        if (replacement) {
            decision.sponsorRepick = replacement.name;
        }
        // No Stable sponsor at all → hold the claim (a claimed room decays without
        // pioneers; holding beats silent abandonment) and let the timeout alert.
    }

    if (claim.phase === ClaimPhase.Claiming) {
        if (targetMine) {
            return { ...decision, advance: ClaimPhase.Pioneering };
        }
        // Claimer death is OBSERVED: the shell GCs creep memory the tick after
        // death, so the name recorded in the slice is the only durable evidence.
        const alive = roster.some(c => nameOf(c) === claim.claimerName);
        if (claim.claimerName !== undefined && !alive) {
            const deaths = claim.claimerDeaths + 1;
            if (deaths > config.claimerDeathLimit) {
                return { ...decision, abort: "claimer-deaths" };
            }
            return { ...decision, claimerDied: true };
        }
        const stillEligible = candidates.some(c => c.roomName === claim.target && eligible(c));
        if (!stillEligible && !targetMine) {
            return { ...decision, abort: "target-ineligible" };
        }
        return decision;
    }

    // --- Pioneering --------------------------------------------------------------
    if (targetHasSpawn) {
        return { ...decision, done: true };
    }
    if (time - claim.startedAt > config.pioneerTimeout) {
        decision.timedOut = true; // alert, but never abandon a claimed room
    }
    return decision;
}

/** The class-B emission pass: demands live one tick, so they cannot come from a
 *  class-C interval entry (a 2% duty cycle against a resolver that decides once
 *  per free spawn per tick). */
export function planExpansionDemands(
    slice: ExpansionMemory,
    sponsorCap: number,
    roster: CreepView[],
    config: ExpansionConfig = EXPANSION_CONFIG
): SpawnDemand[] {
    const claim = slice.claim;
    if (!claim || sponsorCap < config.minSponsorCap) {
        return [];
    }
    const kindOf = (c: CreepView): string | undefined =>
        (c.memory as { assignment?: { kind?: string; room?: string } }).assignment?.kind;
    const forTarget = (c: CreepView): boolean =>
        (c.memory as { assignment?: { room?: string } }).assignment?.room === claim.target;

    if (claim.phase === ClaimPhase.Claiming) {
        if (roster.some(c => kindOf(c) === AssignmentKind.Claim && forTarget(c))) {
            return [];
        }
        return [
            {
                id: `claim:${claim.target}`,
                priority: PRIORITY_CLAIMER,
                home: claim.sponsor,
                owner: SubsystemId.Expansion,
                assignment: { kind: AssignmentKind.Claim, room: claim.target },
                body: [CLAIM, MOVE]
            }
        ];
    }

    const staffed = roster.filter(c => kindOf(c) === AssignmentKind.Pioneer && forTarget(c)).length;
    const demands: SpawnDemand[] = [];
    for (let slot = staffed; slot < config.pioneers; slot++) {
        demands.push({
            id: `pioneer:${claim.target}:${slot}`,
            priority: PRIORITY_PIONEER,
            home: claim.sponsor,
            owner: SubsystemId.Expansion,
            assignment: { kind: AssignmentKind.Pioneer, room: claim.target },
            body: [WORK, WORK, CARRY, CARRY, CARRY, CARRY, MOVE, MOVE]
        });
    }
    return demands;
}
