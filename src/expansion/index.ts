/**
 * Expansion adapter: the class-C decision entry and the class-B emission entry
 * (demands live one tick and must precede Spawn). Owner of Memory.expansion.
 * See docs/design/expansion.md.
 *
 * Reads the world (intel for candidate rooms, snapshot for sponsors and target
 * state), hands a plain input to the pure state machine, applies whatever it
 * returns to the slice. The split is the same as everywhere else, but it matters
 * more here than most: expansion's branches are rare and slow to reproduce
 * live — a claimer dying, a sponsor being lost mid-claim, a target becoming
 * ineligible — so they have to be reachable from a unit test.
 */
import { AssignmentKind } from "shared/assignments";
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { CreepView } from "shared/views";
import { getIntel, isUnsafe } from "intel/index";
import { alert, AlertKind, log } from "telemetry/index";
import { EXPANSION_CONFIG } from "expansion/config";
import { ClaimPhase, ExpansionMemory, planExpansionDecision, planExpansionDemands } from "expansion/plan";
import { ExpansionCandidate } from "expansion/score";

export type { ExpansionMemory } from "expansion/plan";

function slice(): ExpansionMemory {
    const mem = Memory as { expansion?: ExpansionMemory };
    if (mem.expansion?.v !== 1) {
        mem.expansion = { v: 1 };
    }
    return mem.expansion;
}

/** Empire's registry reads this: a spawnless claim target is Bootstrapping, not
 *  Crippled (both rules match a fresh claim — the ordering is the spec). */
export function getClaimTarget(): string | undefined {
    return slice().claim?.target;
}

function expansionRoster(ctx: TickContext): CreepView[] {
    return ctx.snapshot.myCreeps.filter(c => (c.memory as { owner?: SubsystemId }).owner === SubsystemId.Expansion);
}

/**
 * Class C (interval 50): the observation-driven state machine.
 *
 * `targetMine` is deliberately checked two ways — live vision if we can see the
 * target, else intel's recorded owner. The claim completes at the moment a
 * creep touches the controller, but we may lose vision of the room immediately
 * after; without the intel fallback the phase would never advance.
 */
export function runDecision(ctx: TickContext, wanted: boolean): void {
    const mem = slice();
    const time = ctx.snapshot.time;
    const me = Object.values(Game.spawns)[0]?.owner.username;

    // Candidates: neighbors of every owned room we have intel on.
    const candidates: ExpansionCandidate[] = [];
    const seen = new Set<string>();
    for (const room of ctx.snapshot.myRooms) {
        const exits = Game.map.describeExits(room.name);
        for (const name of exits ? Object.values(exits).filter((n): n is string => typeof n === "string") : []) {
            if (seen.has(name)) {
                continue;
            }
            seen.add(name);
            const intel = getIntel(name);
            if (!intel) {
                continue;
            }
            candidates.push({
                roomName: name,
                intel,
                travelTiles: Game.map.getRoomLinearDistance(room.name, name) * 50 + 25,
                unsafe: isUnsafe(name, time),
                foreignReserved: intel.reservedBy !== undefined && intel.reservedBy !== me
            });
        }
    }

    const sponsors = ctx.snapshot.myRooms
        .filter(r => (r.structures[STRUCTURE_SPAWN]?.length ?? 0) > 0)
        .map(r => ({ name: r.name, cap: r.energyCapacityAvailable }))
        .sort((a, b) => b.cap - a.cap);

    const ownedMinerals = ctx.snapshot.myRooms
        .map(r => r.mineral?.type)
        .filter((m): m is MineralConstant => m !== undefined);

    const target = mem.claim?.target;
    const targetView = target ? ctx.snapshot.room(target) : undefined;
    const targetIntel = target ? getIntel(target) : undefined;
    const targetMine = targetView?.controller?.my === true || (targetIntel?.owner !== undefined && targetIntel.owner === me);
    const targetHasSpawn = (targetView?.structures[STRUCTURE_SPAWN]?.length ?? 0) > 0;

    const decision = planExpansionDecision({
        slice: mem,
        wanted,
        candidates,
        ownedMinerals,
        sponsors,
        roster: expansionRoster(ctx),
        targetMine,
        targetHasSpawn,
        time,
        config: EXPANSION_CONFIG
    });

    if (decision.start) {
        mem.claim = {
            target: decision.start.target,
            sponsor: decision.start.sponsor,
            phase: ClaimPhase.Claiming,
            startedAt: time,
            claimerDeaths: 0
        };
        log.info(SubsystemId.Expansion, () => `claiming ${decision.start!.target} from ${decision.start!.sponsor}`);
        return;
    }
    if (!mem.claim) {
        return;
    }
    if (decision.sponsorRepick) {
        mem.claim.sponsor = decision.sponsorRepick;
    }
    if (decision.claimerDied) {
        mem.claim.claimerDeaths++;
        delete mem.claim.claimerName;
    }
    if (decision.advance) {
        mem.claim.phase = decision.advance;
        log.info(SubsystemId.Expansion, () => `${mem.claim!.target} claimed — pioneering`);
    }
    if (decision.timedOut) {
        alert(AlertKind.ExpansionStalled, `${mem.claim.target}: pioneering past timeout`);
    }
    if (decision.abort) {
        log.warn(SubsystemId.Expansion, () => `abort ${mem.claim!.target}: ${decision.abort!}`);
        delete mem.claim;
        mem.cooldownUntil = time + EXPANSION_CONFIG.claimCooldown;
        return;
    }
    if (decision.done) {
        log.info(SubsystemId.Expansion, () => `${mem.claim!.target} stands on its own — claim cleared`);
        delete mem.claim;
    }
}

/** Class B (every tick), before Spawn: emit the active claim's demands. */
export function runEmit(ctx: TickContext): void {
    const mem = slice();
    if (!mem.claim) {
        return;
    }
    const sponsor = ctx.snapshot.myRooms.find(r => r.name === mem.claim!.sponsor);
    if (!sponsor) {
        return;
    }
    const roster = expansionRoster(ctx);
    ctx.spawnDemands.push(...planExpansionDemands(mem, sponsor.energyCapacityAvailable, roster, EXPANSION_CONFIG));

    // Record the live claimer's name — the only durable evidence of its death
    // once the shell GCs its memory (the state machine observes, never events).
    if (mem.claim.phase === ClaimPhase.Claiming && mem.claim.claimerName === undefined) {
        const claimer = roster.find(
            c => (c.memory as { assignment?: { kind?: string } }).assignment?.kind === AssignmentKind.Claim
        );
        if (claimer) {
            mem.claim.claimerName = claimer.name;
        }
    }
}
