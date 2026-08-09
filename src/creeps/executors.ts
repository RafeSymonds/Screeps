/**
 * Pure state machines, one per assignment kind — the entire M2 micro-policy.
 * All "nearest/biggest" choices are argmax over explicit candidates inside one
 * pure function (the only scoring the architecture permits). See docs/design/creeps.md.
 */
import { HaulAssignment, MineAssignment, UpgradeAssignment } from "shared/assignments";
import { CreepView, DroppedView, Pos, RoomSnapshot, StructureView } from "shared/views";
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

export function decideMine(creep: CreepView, a: MineAssignment, room: RoomSnapshot): Action {
    const source = room.sources.find(s => s.id === a.sourceId);
    if (!source) {
        return { kind: ActionKind.Idle, reason: "no-source" };
    }
    if (chebyshev(creep.pos, source.pos) <= 1) {
        return { kind: ActionKind.Harvest, targetId: source.id };
    }
    return { kind: ActionKind.MoveTo, pos: source.pos, range: 1 };
}

export function decideHaul(
    creep: CreepView,
    a: HaulAssignment,
    room: RoomSnapshot,
    upgradeSpot: Pos | undefined
): Action {
    if (creep.store.used === 0) {
        // Collect at the assigned source's pile.
        const source = room.sources.find(s => s.id === a.sourceId);
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
        // No pile: never squat a miner seat while idle (M2 has no shove).
        if (source && chebyshev(creep.pos, source.pos) <= 1) {
            const step = stepAwayFrom(creep.pos, source.pos);
            return { kind: ActionKind.MoveTo, pos: step, range: 0 };
        }
        return { kind: ActionKind.Idle, reason: "no-pile" };
    }

    // Deliver: spawn/extensions first, then the upgrade pile.
    const sinks: StructureView[] = [
        ...(room.structures[STRUCTURE_SPAWN] ?? []),
        ...(room.structures[STRUCTURE_EXTENSION] ?? [])
    ].filter(s => (s.store?.free ?? 0) > 0);
    const sink = nearest(creep.pos, sinks);
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
    if (creep.store.used > 0) {
        if (chebyshev(creep.pos, controller.pos) <= 3) {
            return { kind: ActionKind.Upgrade, targetId: controller.id };
        }
        return { kind: ActionKind.MoveTo, pos: controller.pos, range: 3 };
    }
    const anchor = upgradeSpot ?? controller.pos;
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
