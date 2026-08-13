/**
 * Pure state machines, one per assignment kind — the entire M3 micro-policy.
 * All "nearest/biggest" choices are argmax over explicit candidates inside one
 * pure function (the only scoring the architecture permits). See docs/design/creeps.md.
 *
 * ## The shape
 *
 * Every `decideX` takes a `CreepView` plus a `RoomSnapshot` and returns a single
 * `Action` describing what the creep should do this tick. They touch no globals,
 * hold no state, and issue no intents — the dispatcher translates the returned
 * Action into a game call. That is what makes creep behavior unit-testable
 * against handwritten room fixtures instead of only observable in a live sim.
 *
 * ## Statelessness is the hard constraint
 *
 * There is no "task" persisted in creep memory that survives across ticks, so
 * every decision is re-derived from the world each tick. That sounds wasteful and
 * is in fact the point: a creep whose target died, whose container was destroyed,
 * or whose room changed hands simply decides differently next tick, with no stale
 * task to detect and clean up. The cost is that "am I filling or spending?" must
 * be readable from the world — usually `store.used`, and where that is ambiguous
 * (a worker deciding whether to keep harvesting) from position instead.
 *
 * ## Tie-breaking is total
 *
 * Where several candidates qualify, the comparison always ends in a tiebreak on
 * `id`. Two creeps evaluating the same room must reach the same answer — and a
 * single creep must reach the same answer on consecutive ticks, or it oscillates
 * between two equally-good targets and never arrives at either.
 */
import { DefendAssignment, HaulAssignment, MineAssignment, WorkAssignment } from "shared/assignments";
import { buildPriorityIndex } from "shared/build";
import { CreepView, DroppedView, HostileView, Pos, RoomSnapshot, SourceView, StructureView } from "shared/views";
import { DEFENSE_CONFIG } from "defense/config";
import { FortifyTarget } from "defense/fortify";
import { ECONOMY_CONFIG } from "economy/config";
import { Action, ActionKind, chebyshev } from "creeps/actions";

/**
 * Best pile for a creep standing at `from`: the one whose energy-per-tick-of-walk
 * is highest, i.e. `amount / (distance + 1)`.
 *
 * Pure biggest-first ignored distance completely, which is why creeps visibly
 * walked past energy at their feet to reach a marginally larger pile across the
 * room — and by the time they arrived, decay had eaten the difference. Pure
 * nearest-first is the opposite mistake: it makes creeps nibble a 20-energy crumb
 * while thousands rot elsewhere. Dividing by distance is the honest trade, and it
 * degenerates to "biggest" when several piles are equally close.
 *
 * The +1 keeps a pile underfoot (distance 0) from dividing by zero, and ties break
 * on id so every creep evaluating the same room reaches the same answer.
 */
function bestPile(from: Pos, piles: DroppedView[]): DroppedView | undefined {
    let best: DroppedView | undefined;
    let bestScore = -1;
    for (const pile of piles) {
        const score = pile.amount / (chebyshev(from, pile.pos) + 1);
        if (score > bestScore || (score === bestScore && best !== undefined && pile.id < best.id)) {
            best = pile;
            bestScore = score;
        }
    }
    return best;
}

/** Largest pile regardless of distance — only for callers already standing at the
 *  place they will collect from. */
function biggestPile(piles: DroppedView[]): DroppedView | undefined {
    let best: DroppedView | undefined;
    for (const pile of piles) {
        if (!best || pile.amount > best.amount || (pile.amount === best.amount && pile.id < best.id)) {
            best = pile;
        }
    }
    return best;
}

/** Nearest by chebyshev (creep movement is 8-way, so chebyshev IS step count).
 *  Ties keep the first candidate, making caller-supplied order the tiebreak. */
function nearest<T extends { pos: Pos }>(from: Pos, candidates: T[]): T | undefined {
    let best: T | undefined;
    let bestDist = Infinity;
    for (const c of candidates) {
        const d = chebyshev(from, c.pos);
        if (d < bestDist) {
            best = c;
            bestDist = d;
        }
    }
    return best;
}

function containerEnergy(c: StructureView): number {
    return c.store?.byResource[RESOURCE_ENERGY] ?? 0;
}

/** The container serving a source: within range 1 of it (creeps.md helper). */
export function sourceContainer(room: RoomSnapshot, source: SourceView): StructureView | undefined {
    return (room.structures[STRUCTURE_CONTAINER] ?? []).find(c => chebyshev(c.pos, source.pos) <= 1);
}

/** The container feeding the upgrade spot: at or adjacent to it. */
export function spotContainer(room: RoomSnapshot, spot: Pos): StructureView | undefined {
    return (room.structures[STRUCTURE_CONTAINER] ?? []).find(c => chebyshev(c.pos, spot) <= 1);
}

const needsRepair = (c: StructureView): boolean => c.hits < ECONOMY_CONFIG.containerRepairFloor;

/**
 * Mine one source from THIS miner's own tile.
 *
 * @param seat  The exact tile this miner owns (creeps/seats.ts), or undefined if
 *   the room is over-staffed and there was no tile left for it.
 *
 * Seats are exact positions, never ranges, and that distinction is the whole fix
 * for the miners-shoving-each-other bug. `MoveTo(source, range 1)` does not name
 * a tile — it asks PathFinder to pick one, and PathFinder picks the same one for
 * every miner given the same goal, so they pile onto it and alternate forever
 * while the source goes unmined. With a seat, two miners can never be issued the
 * same destination. See seats.ts for the full history.
 */
export function decideMine(creep: CreepView, a: MineAssignment, room: RoomSnapshot, seat?: Pos): Action {
    const source = room.sources.find(s => s.id === a.sourceId);
    if (!source) {
        return { kind: ActionKind.Idle, reason: "no-source" };
    }
    if (seat) {
        // Range 0: my tile, nobody else's. Note this also re-seats a miner that
        // got displaced, which the old in-range-1 check never did — once a miner
        // was anywhere adjacent it stopped caring where it stood, so a creep
        // shoved off the container never went back.
        if (creep.pos.x !== seat.x || creep.pos.y !== seat.y || creep.pos.roomName !== seat.roomName) {
            return { kind: ActionKind.MoveTo, pos: seat, range: 0 };
        }
    } else if (chebyshev(creep.pos, source.pos) > 1) {
        // No seat left for this miner (over-staffed). Get in range and drop-mine
        // rather than fight for a tile it cannot have.
        return { kind: ActionKind.MoveTo, pos: source.pos, range: 1 };
    }
    const container = sourceContainer(room, source);
    // In harvest range: work.
    // Carrying capacity is the exception now, not the rule (economy.md): a pure
    // WORK+MOVE miner can neither hold repair energy nor feed a link, and both
    // paths would otherwise burn an intent every tick on an error return.
    const canCarry = creep.store.free + creep.store.used > 0;
    const onContainer = container !== undefined && creep.pos.x === container.pos.x && creep.pos.y === container.pos.y;
    if (container && onContainer && canCarry && needsRepair(container)) {
        if ((creep.store.byResource[RESOURCE_ENERGY] ?? 0) > 0) {
            return { kind: ActionKind.Repair, targetId: container.id };
        }
        if (containerEnergy(container) > 0) {
            return { kind: ActionKind.Withdraw, targetId: container.id, resource: RESOURCE_ENERGY };
        }
    }
    // Link feed (M5): a link beside the seat receives the store at ≥ half full —
    // one transfer intent per ~5 saturated ticks (economy.md Links).
    const link = (room.structures[STRUCTURE_LINK] ?? []).find(
        l => chebyshev(l.pos, creep.pos) <= 1 && (l.store?.free ?? 0) > 0
    );
    if (link && creep.store.used > 0 && creep.store.used * 2 >= creep.store.used + creep.store.free) {
        return { kind: ActionKind.Transfer, targetId: link.id, resource: RESOURCE_ENERGY };
    }
    return { kind: ActionKind.Harvest, targetId: source.id };
}

/**
 * Haul: collect energy, then deliver it to whatever needs it most.
 *
 * Collect tiers: own source's container → piles near that source → **any** stray
 * pile in the room → storage. Deliver tiers: towers (only while hostiles are
 * present) → spawn/extensions → the controller feed if it is starving → towers →
 * controller container → storage → dropped at the upgrade spot.
 *
 * Two things about that deliver ladder are load-bearing rather than arbitrary.
 * Spawn-side outranks everything in peacetime because an empty extension means no
 * replacement creeps, and every other problem is downstream of that. And the
 * final rung *drops on the ground* rather than idling: dropped energy decays
 * slowly and upgraders collect it, so a full hauler with nowhere to put its load
 * still moves energy toward work instead of parking with it.
 */
export function decideHaul(
    creep: CreepView,
    a: HaulAssignment,
    room: RoomSnapshot,
    upgradeSpot: Pos | undefined
): Action {
    if (creep.store.used === 0) {
        const source = room.sources.find(s => s.id === a.sourceId);
        // Collect: the source's container first, ground piles as fallback/overflow.
        const container = source ? sourceContainer(room, source) : undefined;
        if (container && containerEnergy(container) >= ECONOMY_CONFIG.minPickup) {
            if (chebyshev(creep.pos, container.pos) <= 1) {
                return { kind: ActionKind.Withdraw, targetId: container.id, resource: RESOURCE_ENERGY };
            }
            return { kind: ActionKind.MoveTo, pos: container.pos, range: 1 };
        }
        const piles = room.dropped.filter(
            d =>
                d.resource === RESOURCE_ENERGY &&
                d.amount >= ECONOMY_CONFIG.minPickup &&
                source !== undefined &&
                chebyshev(d.pos, source.pos) <= 2
        );
        const pile = biggestPile(piles);
        if (pile) {
            if (chebyshev(creep.pos, pile.pos) <= 1) {
                return { kind: ActionKind.Pickup, targetId: pile.id };
            }
            return { kind: ActionKind.MoveTo, pos: pile.pos, range: 1 };
        }
        // Is anything spawn-side actually hungry? Decides both the stray rule below
        // and the storage tier further down.
        const spawnSideNeedy = [
            ...(room.structures[STRUCTURE_SPAWN] ?? []),
            ...(room.structures[STRUCTURE_EXTENSION] ?? [])
        ].some(s => (s.store?.free ?? 0) > 0);

        // Room-wide fallback: source affinity is an assignment detail, not a reason
        // to let energy rot. Sim-measured: 2,643 energy on the ground and climbing
        // while two haulers idled "no-pile", because every pile was more than two
        // tiles from their own source.
        //
        // The upgrade-spot pile is normally excluded — it is the upgraders' feed,
        // and collecting from it would just re-drop it there. But that exclusion
        // must NOT outrank spawning. Field-reported deadlock: a hauler's own
        // container empty, no pile near its source, and the room's only energy
        // sitting at the upgrade spot — so it idled "no-pile" while the spawn sat
        // at zero and nothing could be built, including the creeps that would have
        // fixed it. Spawn-side already outranks the controller feed on the deliver
        // ladder; the collect side has to agree or the two ladders deadlock against
        // each other. Once spawn-side is full the exclusion returns, so there is no
        // pick-up/re-drop loop.
        const strays = room.dropped.filter(
            d =>
                d.resource === RESOURCE_ENERGY &&
                d.amount >= ECONOMY_CONFIG.minPickup &&
                (spawnSideNeedy || upgradeSpot === undefined || chebyshev(d.pos, upgradeSpot) > 1)
        );
        const stray = biggestPile(strays);
        if (stray) {
            if (chebyshev(creep.pos, stray.pos) <= 1) {
                return { kind: ActionKind.Pickup, targetId: stray.id };
            }
            return { kind: ActionKind.MoveTo, pos: stray.pos, range: 1 };
        }
        // Storage tier (M4): the reserve funds spawning and recovery — withdraw only
        // while spawn-side has free capacity, so no hauler ever loops storage→storage.
        const storage = (room.structures[STRUCTURE_STORAGE] ?? []).find(
            s => (s.store?.byResource[RESOURCE_ENERGY] ?? 0) >= ECONOMY_CONFIG.minPickup
        );
        if (spawnSideNeedy && storage) {
            if (chebyshev(creep.pos, storage.pos) <= 1) {
                return { kind: ActionKind.Withdraw, targetId: storage.id, resource: RESOURCE_ENERGY };
            }
            return { kind: ActionKind.MoveTo, pos: storage.pos, range: 1 };
        }
        // Nothing to collect: never squat a miner seat while idle.
        if (source && chebyshev(creep.pos, source.pos) <= 1) {
            const step = stepAwayFrom(creep.pos, source.pos);
            return { kind: ActionKind.MoveTo, pos: step, range: 0 };
        }
        return { kind: ActionKind.Idle, reason: "no-pile" };
    }

    // Deliver: towers under threat → spawn/extensions → controller feed when
    // starving → towers → controller container → storage → drop at the spot.
    // The wartime tower promotion closes the refill deadlock: raid spawning holds
    // spawn-side capacity open forever, so the peacetime tower tier below is
    // unreachable exactly when it matters (defense.md rung 1).
    const towerSinksAll = (room.structures[STRUCTURE_TOWER] ?? []).filter(s => (s.store?.free ?? 0) > 0);
    if (room.hostiles.length > 0) {
        const warTower = nearest(creep.pos, towerSinksAll);
        if (warTower) {
            if (chebyshev(creep.pos, warTower.pos) <= 1) {
                return { kind: ActionKind.Transfer, targetId: warTower.id, resource: RESOURCE_ENERGY };
            }
            return { kind: ActionKind.MoveTo, pos: warTower.pos, range: 1 };
        }
    }
    const spawnSinks: StructureView[] = [
        ...(room.structures[STRUCTURE_SPAWN] ?? []),
        ...(room.structures[STRUCTURE_EXTENSION] ?? [])
    ].filter(s => (s.store?.free ?? 0) > 0);
    const spawnSink = nearest(creep.pos, spawnSinks);
    if (spawnSink) {
        if (chebyshev(creep.pos, spawnSink.pos) <= 1) {
            return { kind: ActionKind.Transfer, targetId: spawnSink.id, resource: RESOURCE_ENERGY };
        }
        return { kind: ActionKind.MoveTo, pos: spawnSink.pos, range: 1 };
    }
    const ctrlContainer = upgradeSpot ? spotContainer(room, upgradeSpot) : undefined;
    if (upgradeSpot) {
        const feedLevel = ctrlContainer
            ? containerEnergy(ctrlContainer)
            : room.dropped
                  .filter(d => d.resource === RESOURCE_ENERGY && chebyshev(d.pos, upgradeSpot) <= 1)
                  .reduce((sum, d) => sum + d.amount, 0);
        if (feedLevel < ECONOMY_CONFIG.controllerFeedFloor) {
            if (ctrlContainer && (ctrlContainer.store?.free ?? 0) > 0) {
                if (chebyshev(creep.pos, ctrlContainer.pos) <= 1) {
                    return { kind: ActionKind.Transfer, targetId: ctrlContainer.id, resource: RESOURCE_ENERGY };
                }
                return { kind: ActionKind.MoveTo, pos: ctrlContainer.pos, range: 1 };
            }
            if (!ctrlContainer) {
                if (chebyshev(creep.pos, upgradeSpot) <= 1) {
                    return { kind: ActionKind.Drop, resource: RESOURCE_ENERGY };
                }
                return { kind: ActionKind.MoveTo, pos: upgradeSpot, range: 1 };
            }
        }
    }
    const containerSinks = ctrlContainer && (ctrlContainer.store?.free ?? 0) > 0 ? [ctrlContainer] : [];
    const storageSinks = (room.structures[STRUCTURE_STORAGE] ?? []).filter(s => (s.store?.free ?? 0) > 0);
    const sink =
        nearest(creep.pos, towerSinksAll) ?? nearest(creep.pos, containerSinks) ?? nearest(creep.pos, storageSinks);
    if (sink) {
        if (chebyshev(creep.pos, sink.pos) <= 1) {
            return { kind: ActionKind.Transfer, targetId: sink.id, resource: RESOURCE_ENERGY };
        }
        return { kind: ActionKind.MoveTo, pos: sink.pos, range: 1 };
    }
    if (!upgradeSpot) {
        return { kind: ActionKind.Idle, reason: "no-spot" };
    }
    if (chebyshev(creep.pos, upgradeSpot) <= 1) {
        return { kind: ActionKind.Drop, resource: RESOURCE_ENERGY };
    }
    return { kind: ActionKind.MoveTo, pos: upgradeSpot, range: 1 };
}

/**
 * Upgrade: keep the controller's progress bar moving, and its downgrade timer
 * from ever reaching zero.
 *
 * Refill tiers run fresh-first — controller link, then controller container, then
 * nearby piles — because the link is refilled continuously by miners while the
 * container drains. Upgraders never touch spawn-side energy: that pool belongs to
 * spawning, and an upgrader emptying an extension delays a replacement creep to
 * buy controller progress we could have had a tick later anyway.
 */
function decideUpgradeWork(creep: CreepView, room: RoomSnapshot, upgradeSpot: Pos | undefined): Action {
    const controller = room.controller;
    if (!controller) {
        return { kind: ActionKind.Idle, reason: "no-controller" };
    }
    const anchor = upgradeSpot ?? controller.pos;
    const container = spotContainer(room, anchor);
    if (creep.store.used > 0) {
        // Upkeep outranks progress only below the repair floor (creeps.md).
        if (container && needsRepair(container)) {
            if (chebyshev(creep.pos, container.pos) <= 3) {
                return { kind: ActionKind.Repair, targetId: container.id };
            }
        }
        if (chebyshev(creep.pos, controller.pos) <= 3) {
            return { kind: ActionKind.Upgrade, targetId: controller.id };
        }
        return { kind: ActionKind.MoveTo, pos: controller.pos, range: 3 };
    }
    // Controller link first (M5): the fresher feed, if one stands by the spot.
    const ctrlLink = (room.structures[STRUCTURE_LINK] ?? []).find(
        l => chebyshev(l.pos, anchor) <= 2 && (l.store?.byResource[RESOURCE_ENERGY] ?? 0) > 0
    );
    if (ctrlLink) {
        if (chebyshev(creep.pos, ctrlLink.pos) <= 1) {
            return { kind: ActionKind.Withdraw, targetId: ctrlLink.id, resource: RESOURCE_ENERGY };
        }
        return { kind: ActionKind.MoveTo, pos: ctrlLink.pos, range: 1 };
    }
    if (container && containerEnergy(container) > 0) {
        if (chebyshev(creep.pos, container.pos) <= 1) {
            return { kind: ActionKind.Withdraw, targetId: container.id, resource: RESOURCE_ENERGY };
        }
        return { kind: ActionKind.MoveTo, pos: container.pos, range: 1 };
    }
    const piles = room.dropped.filter(d => d.resource === RESOURCE_ENERGY && chebyshev(d.pos, anchor) <= 4);
    const pile = bestPile(creep.pos, piles);
    if (!pile) {
        // Nothing to collect anywhere: self-supply by harvesting rather than idle.
        // This is what lets a single worker bootstrap a freshly claimed or wiped
        // room that has no miners, no haulers and no spawn (the old Pioneer role).
        const src = nearest(creep.pos, room.sources);
        if (src) {
            if (chebyshev(creep.pos, src.pos) <= 1) {
                return { kind: ActionKind.Harvest, targetId: src.id };
            }
            return { kind: ActionKind.MoveTo, pos: src.pos, range: 1 };
        }
        return { kind: ActionKind.Idle, reason: "no-pile" };
    }
    if (chebyshev(creep.pos, pile.pos) <= 1) {
        return { kind: ActionKind.Pickup, targetId: pile.id };
    }
    return { kind: ActionKind.MoveTo, pos: pile.pos, range: 1 };
}

/**
 * Build: construction sites and rampart upkeep, falling through to upgrading.
 *
 * The fallthrough matters more than it looks — labor is never stranded. A builder
 * with no sites becomes an upgrader for that tick rather than idling, so the
 * workforce planner can keep a stable headcount instead of churning bodies every
 * time the construction queue empties.
 */
export function decideWork(
    creep: CreepView,
    _a: WorkAssignment,
    room: RoomSnapshot,
    upgradeSpot: Pos | undefined,
    fortifyTargets: FortifyTarget[] = []
): Action {
    // Fill-then-spend. A worker that is part-full AND standing next to a source
    // with nothing else to draw from keeps harvesting rather than trotting off to
    // a site with four energy — the old Pioneer rule, kept because harvesting takes
    // many ticks and "empty → collect, else deliver" would abort it immediately.
    const selfSupplying =
        creep.store.free > 0 &&
        room.sources.some(sv => chebyshev(creep.pos, sv.pos) <= 1) &&
        (room.structures[STRUCTURE_CONTAINER] ?? []).every(c => containerEnergy(c) < ECONOMY_CONFIG.minPickup) &&
        room.dropped.every(d => d.resource !== RESOURCE_ENERGY || d.amount < ECONOMY_CONFIG.minPickup);
    if (selfSupplying) {
        const here = nearest(creep.pos, room.sources);
        if (here) {
            return { kind: ActionKind.Harvest, targetId: here.id };
        }
    }
    const sites = room.myConstructionSites;
    if (sites.length === 0 && fortifyTargets.length === 0) {
        // Nothing to build or maintain — labor is never stranded: upgrade.
        return decideUpgradeWork(creep, room, upgradeSpot);
    }
    if (creep.store.used === 0) {
        // Refill — never from spawn/extensions/controller container (economy.md).
        const ctrlContainer = upgradeSpot ? spotContainer(room, upgradeSpot) : undefined;
        const sourceContainers = (room.structures[STRUCTURE_CONTAINER] ?? []).filter(
            c =>
                c.id !== ctrlContainer?.id &&
                containerEnergy(c) >= ECONOMY_CONFIG.minPickup &&
                room.sources.some(s => chebyshev(c.pos, s.pos) <= 1)
        );
        const container = nearest(creep.pos, sourceContainers);
        if (container) {
            if (chebyshev(creep.pos, container.pos) <= 1) {
                return { kind: ActionKind.Withdraw, targetId: container.id, resource: RESOURCE_ENERGY };
            }
            return { kind: ActionKind.MoveTo, pos: container.pos, range: 1 };
        }
        // Energy per tick of walking (bestPile): a worker should not cross the room
        // for a marginally larger pile while energy sits at its feet.
        const pile = bestPile(
            creep.pos,
            room.dropped.filter(d => d.resource === RESOURCE_ENERGY && d.amount >= ECONOMY_CONFIG.minPickup)
        );
        if (pile) {
            if (chebyshev(creep.pos, pile.pos) <= 1) {
                return { kind: ActionKind.Pickup, targetId: pile.id };
            }
            return { kind: ActionKind.MoveTo, pos: pile.pos, range: 1 };
        }
        // Storage as the last refill tier — the reserve funds building too (M4).
        const storage = (room.structures[STRUCTURE_STORAGE] ?? []).find(
            s => (s.store?.byResource[RESOURCE_ENERGY] ?? 0) >= ECONOMY_CONFIG.minPickup
        );
        if (storage) {
            if (chebyshev(creep.pos, storage.pos) <= 1) {
                return { kind: ActionKind.Withdraw, targetId: storage.id, resource: RESOURCE_ENERGY };
            }
            return { kind: ActionKind.MoveTo, pos: storage.pos, range: 1 };
        }
        // SELF-SUPPLY — the old Pioneer role, folded in. A room with no miners,
        // no haulers and no spawn (freshly claimed, or wiped) has no logistics to
        // draw from, and a worker that idles there means the room never starts.
        // Harvesting is slow and a last resort, which is exactly why it belongs at
        // the bottom of the ladder rather than in a separate creep type.
        const src = nearest(creep.pos, room.sources);
        if (src) {
            if (chebyshev(creep.pos, src.pos) <= 1) {
                return { kind: ActionKind.Harvest, targetId: src.id };
            }
            return { kind: ActionKind.MoveTo, pos: src.pos, range: 1 };
        }
        return { kind: ActionKind.Idle, reason: "no-energy" };
    }
    // Work order (defense.md — this exact precedence closes the rampart-decay
    // livelock): 1. emergency fortify, 2. focus site, 3. fortify, 4. upgrade.
    const emergency = fortifyTargets.find(t => t.hits < DEFENSE_CONFIG.emergencyFloor);
    if (emergency) {
        if (chebyshev(creep.pos, emergency.pos) <= 3) {
            return { kind: ActionKind.Repair, targetId: emergency.id };
        }
        return { kind: ActionKind.MoveTo, pos: emergency.pos, range: 3 };
    }
    if (sites.length > 0) {
        // Focus site: (BUILD_PRIORITY index, remaining energy, id) — construction's
        // own order, so every builder independently converges on the same site.
        let focus = sites[0];
        for (const site of sites.slice(1)) {
            const a1 = buildPriorityIndex(site.type);
            const b1 = buildPriorityIndex(focus.type);
            const a2 = site.progressTotal - site.progress;
            const b2 = focus.progressTotal - focus.progress;
            if (a1 < b1 || (a1 === b1 && (a2 < b2 || (a2 === b2 && site.id < focus.id)))) {
                focus = site;
            }
        }
        if (chebyshev(creep.pos, focus.pos) <= 3) {
            return { kind: ActionKind.Build, targetId: focus.id };
        }
        return { kind: ActionKind.MoveTo, pos: focus.pos, range: 3 };
    }
    const target = fortifyTargets[0]; // accessor returns ascending hits
    if (target) {
        if (chebyshev(creep.pos, target.pos) <= 3) {
            return { kind: ActionKind.Repair, targetId: target.id };
        }
        return { kind: ActionKind.MoveTo, pos: target.pos, range: 3 };
    }
    return decideUpgradeWork(creep, room, upgradeSpot);
}

/**
 * Defend: pursue the nearest armed hostile; park near the spawn when quiet.
 * "Armed" excludes bodies with none of ATTACK/RANGED_ATTACK/HEAL/WORK/CLAIM —
 * chasing an unarmed scout across the room leaves the base uncovered for free.
 */
export function decideDefend(creep: CreepView, _a: DefendAssignment, room: RoomSnapshot): Action {
    const armed = room.hostiles.filter((h: HostileView) =>
        [ATTACK, RANGED_ATTACK, HEAL, WORK, CLAIM].some(p => (h.bodyCounts[p] ?? 0) > 0)
    );
    const target = nearest(creep.pos, armed);
    if (target) {
        if (chebyshev(creep.pos, target.pos) <= 1) {
            return { kind: ActionKind.Attack, targetId: target.id };
        }
        return { kind: ActionKind.MoveTo, pos: target.pos, range: 1 };
    }
    const spawn = room.structures[STRUCTURE_SPAWN]?.[0];
    if (spawn && chebyshev(creep.pos, spawn.pos) > 2) {
        return { kind: ActionKind.MoveTo, pos: spawn.pos, range: 2 };
    }
    return { kind: ActionKind.Idle, reason: "parked" };
}

/** One walkable-agnostic tile directly away from `from` — movement paths the detail. */
function stepAwayFrom(pos: Pos, from: Pos): Pos {
    const dx = Math.sign(pos.x - from.x) || 1;
    const dy = Math.sign(pos.y - from.y) || 0;
    return {
        x: Math.min(48, Math.max(1, pos.x + dx)),
        y: Math.min(48, Math.max(1, pos.y + dy)),
        roomName: pos.roomName
    };
}
