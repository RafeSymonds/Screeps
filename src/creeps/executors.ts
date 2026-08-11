/**
 * Pure state machines, one per assignment kind — the entire M3 micro-policy.
 * All "nearest/biggest" choices are argmax over explicit candidates inside one
 * pure function (the only scoring the architecture permits). See docs/design/creeps.md.
 */
import {
    AssignmentKind,
    BuildAssignment,
    DefendAssignment,
    HaulAssignment,
    MineAssignment,
    PioneerAssignment,
    UpgradeAssignment
} from "shared/assignments";
import { buildPriorityIndex } from "shared/build";
import { CreepView, DroppedView, HostileView, Pos, RoomSnapshot, SourceView, StructureView } from "shared/views";
import { DEFENSE_CONFIG } from "defense/config";
import { FortifyTarget } from "defense/fortify";
import { ECONOMY_CONFIG } from "economy/config";
import { Action, ActionKind, chebyshev } from "creeps/actions";

function biggestPile(piles: DroppedView[]): DroppedView | undefined {
    let best: DroppedView | undefined;
    for (const pile of piles) {
        if (!best || pile.amount > best.amount || (pile.amount === best.amount && pile.id < best.id)) {
            best = pile;
        }
    }
    return best;
}

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
 * @param hasSeat  Is this creep the one miner entitled to stand ON the source's
 *   container? A container is ONE tile: when every miner of a source targeted it,
 *   the losers ended up adjacent to the container but two tiles from the source,
 *   so they never satisfied the in-range-1 harvest check and pathed onto the
 *   occupied seat forever — two miners visibly shoving each other, mining
 *   nothing (and, downstream, no energy to spawn or haul). Non-owners take any
 *   adjacent tile and drop-mine.
 */
export function decideMine(creep: CreepView, a: MineAssignment, room: RoomSnapshot, hasSeat = true): Action {
    const source = room.sources.find(s => s.id === a.sourceId);
    if (!source) {
        return { kind: ActionKind.Idle, reason: "no-source" };
    }
    const container = hasSeat ? sourceContainer(room, source) : undefined;
    if (chebyshev(creep.pos, source.pos) > 1) {
        // Seat: the container tile when one exists AND is ours, else any adjacent tile.
        return container
            ? { kind: ActionKind.MoveTo, pos: container.pos, range: 0 }
            : { kind: ActionKind.MoveTo, pos: source.pos, range: 1 };
    }
    // In harvest range: work. Off-seat-but-in-range miners drop-mine (transitional —
    // the in-range check is the seat's range to source, not container occupancy;
    // replacements target the container tile and consolidation ends the state).
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
        // Room-wide fallback: source affinity is an assignment detail, not a reason
        // to let energy rot. Sim-measured: 2,643 energy on the ground and climbing
        // while two haulers idled "no-pile", because every pile was more than two
        // tiles from their own source. Excludes the upgrade spot — that pile is the
        // upgraders' feed, and collecting from it would just be re-dropped there.
        const strays = room.dropped.filter(
            d =>
                d.resource === RESOURCE_ENERGY &&
                d.amount >= ECONOMY_CONFIG.minPickup &&
                (upgradeSpot === undefined || chebyshev(d.pos, upgradeSpot) > 1)
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
        const spawnSideNeedy = [
            ...(room.structures[STRUCTURE_SPAWN] ?? []),
            ...(room.structures[STRUCTURE_EXTENSION] ?? [])
        ].some(s => (s.store?.free ?? 0) > 0);
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

export function decideUpgrade(
    creep: CreepView,
    _a: UpgradeAssignment,
    room: RoomSnapshot,
    upgradeSpot: Pos | undefined
): Action {
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
    const pile = biggestPile(piles);
    if (!pile) {
        return { kind: ActionKind.Idle, reason: "no-pile" };
    }
    if (chebyshev(creep.pos, pile.pos) <= 1) {
        return { kind: ActionKind.Pickup, targetId: pile.id };
    }
    return { kind: ActionKind.MoveTo, pos: pile.pos, range: 1 };
}

export function decideBuild(
    creep: CreepView,
    _a: BuildAssignment,
    room: RoomSnapshot,
    upgradeSpot: Pos | undefined,
    fortifyTargets: FortifyTarget[] = []
): Action {
    const sites = room.myConstructionSites;
    if (sites.length === 0 && fortifyTargets.length === 0) {
        // Nothing to build or maintain — labor is never stranded: upgrade.
        return decideUpgrade(creep, { kind: AssignmentKind.Upgrade, room: room.name }, room, upgradeSpot);
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
        // Nearest pile, not biggest (creeps.md): the big piles sit at the sources,
        // ~20 tiles from the sites; the haulers' upgrade-spot pile is next door and
        // construction outranks upgrading by declared priority.
        const piles = room.dropped.filter(d => d.resource === RESOURCE_ENERGY && d.amount >= ECONOMY_CONFIG.minPickup);
        let pile: DroppedView | undefined;
        for (const p of piles) {
            if (!pile) {
                pile = p;
                continue;
            }
            const dp = chebyshev(creep.pos, p.pos);
            const db = chebyshev(creep.pos, pile.pos);
            if (dp < db || (dp === db && (p.amount > pile.amount || (p.amount === pile.amount && p.id < pile.id)))) {
                pile = p;
            }
        }
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
    return decideUpgrade(creep, { kind: AssignmentKind.Upgrade, room: room.name }, room, upgradeSpot);
}

/** Defend: pursue the nearest armed hostile; park near the spawn when quiet. */
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

/**
 * Pioneer (M6): the ONE role that harvests and builds and upgrades, because a
 * freshly claimed room has no miners, no haulers, and no spawn to make them.
 * Precedence: refill by harvesting → build the spawn site → upgrade (which at
 * level 1 is not polish: the 20k downgrade timer runs down while we build, and
 * expiry unclaims the room outright).
 */
export function decidePioneer(creep: CreepView, _a: PioneerAssignment, room: RoomSnapshot): Action {
    // Fill-then-spend, statelessly: harvesting takes many ticks, so "empty →
    // collect, else deliver" (every other executor's rule) would send a pioneer
    // to the site after ONE tick of harvest carrying 4 energy. Position closes
    // the loop instead — adjacent to a source and not full means keep harvesting;
    // away from a source with a load means go spend it.
    if (creep.store.free > 0) {
        const source = nearest(creep.pos, room.sources);
        if (source && chebyshev(creep.pos, source.pos) <= 1) {
            return { kind: ActionKind.Harvest, targetId: source.id };
        }
        if (creep.store.used === 0) {
            if (!source) {
                return { kind: ActionKind.Idle, reason: "no-source" };
            }
            return { kind: ActionKind.MoveTo, pos: source.pos, range: 1 };
        }
    }
    const site = room.myConstructionSites.find(s => s.type === STRUCTURE_SPAWN) ?? room.myConstructionSites[0];
    if (site) {
        if (chebyshev(creep.pos, site.pos) <= 3) {
            return { kind: ActionKind.Build, targetId: site.id };
        }
        return { kind: ActionKind.MoveTo, pos: site.pos, range: 3 };
    }
    const controller = room.controller;
    if (!controller) {
        return { kind: ActionKind.Idle, reason: "no-controller" };
    }
    if (chebyshev(creep.pos, controller.pos) <= 3) {
        return { kind: ActionKind.Upgrade, targetId: controller.id };
    }
    return { kind: ActionKind.MoveTo, pos: controller.pos, range: 3 };
}
