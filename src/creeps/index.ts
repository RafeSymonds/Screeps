/**
 * Creep execution: dispatch each creep's assignment to its pure executor, then
 * perform the returned Action — a dumb switch over game intents, with MoveTo
 * routed to movement. Executors never write assignments. See docs/design/creeps.md.
 */
import { Assignment, AssignmentKind } from "shared/assignments";
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { CreepView } from "shared/views";
import { fortificationTargets } from "defense/index";
import { FortifyTarget } from "defense/fortify";
import { getUpgradeSpot } from "economy/index";
import { isUnsafe } from "intel/index";
import { requestMove } from "movement/index";
import { resolve } from "snapshot/handles";
import { log } from "telemetry/index";
import { Action, ActionKind } from "creeps/actions";
import { decideBuild, decideDefend, decideHaul, decideMine, decidePioneer, decideUpgrade } from "creeps/executors";

const idleTally: Record<string, number> = {};

/** Per-tick memo: the fortify accessor scans room walls once per room, not per creep. */
let fortifyTick = -1;
const fortifyMemo = new Map<string, FortifyTarget[]>();

function fortifyFor(ctx: TickContext, roomName: string): FortifyTarget[] {
    if (fortifyTick !== ctx.snapshot.time) {
        fortifyMemo.clear();
        fortifyTick = ctx.snapshot.time;
    }
    let targets = fortifyMemo.get(roomName);
    if (!targets) {
        const room = ctx.snapshot.room(roomName);
        targets = room ? fortificationTargets(roomName, room) : [];
        fortifyMemo.set(roomName, targets);
    }
    return targets;
}

/** The M5 cross-room rule: for Haul, empty works in `room`, loaded in `to`. */
function workRoomOf(creep: CreepView, assignment: Assignment): string {
    if (assignment.kind === AssignmentKind.Haul && creep.store.used > 0) {
        return assignment.to ?? assignment.room;
    }
    return assignment.room;
}

function decide(creep: CreepView, assignment: Assignment, ctx: TickContext): Action {
    // Retreat: an unsafe work room empties out (intel's persistent sighting).
    const workRoom = workRoomOf(creep, assignment);
    if (creep.pos.roomName === workRoom && workRoom !== (creep.memory as { home?: string }).home && isUnsafe(workRoom, ctx.snapshot.time)) {
        const home = (creep.memory as { home?: string }).home;
        if (home) {
            return { kind: ActionKind.MoveTo, pos: { x: 25, y: 25, roomName: home }, range: 5 };
        }
    }
    // Travel preamble: outside the work room → walk there; needs no vision (the
    // M4 no-view→Idle rule deadlocked every creep whose job is somewhere unseen).
    if (creep.pos.roomName !== workRoom) {
        return { kind: ActionKind.MoveTo, pos: { x: 25, y: 25, roomName: workRoom }, range: 20 };
    }
    // Standing in the work room: its view exists by definition.
    const room = ctx.snapshot.room(creep.pos.roomName);
    if (!room) {
        return { kind: ActionKind.Idle, reason: "no-vision" };
    }
    switch (assignment.kind) {
        case AssignmentKind.Mine:
            return decideMine(creep, assignment, room);
        case AssignmentKind.Haul:
            return decideHaul(creep, assignment, room, getUpgradeSpot(assignment.room));
        case AssignmentKind.Upgrade:
            return decideUpgrade(creep, assignment, room, getUpgradeSpot(assignment.room));
        case AssignmentKind.Build:
            return decideBuild(creep, assignment, room, getUpgradeSpot(assignment.room), fortifyFor(ctx, assignment.room));
        case AssignmentKind.Defend:
            return decideDefend(creep, assignment, room);
        case AssignmentKind.Scout:
            // The travel preamble did the walking; linger for intel's refresher.
            return { kind: ActionKind.Idle, reason: "scouting" };
        case AssignmentKind.Reserve: {
            const controller = room.controller;
            if (!controller) {
                return { kind: ActionKind.Idle, reason: "no-controller" };
            }
            if (Math.max(Math.abs(creep.pos.x - controller.pos.x), Math.abs(creep.pos.y - controller.pos.y)) <= 1) {
                return { kind: ActionKind.ReserveController, targetId: controller.id };
            }
            return { kind: ActionKind.MoveTo, pos: controller.pos, range: 1 };
        }
        case AssignmentKind.Claim: {
            const controller = room.controller;
            if (!controller) {
                return { kind: ActionKind.Idle, reason: "no-controller" };
            }
            if (Math.max(Math.abs(creep.pos.x - controller.pos.x), Math.abs(creep.pos.y - controller.pos.y)) <= 1) {
                return { kind: ActionKind.ClaimController, targetId: controller.id };
            }
            return { kind: ActionKind.MoveTo, pos: controller.pos, range: 1 };
        }
        case AssignmentKind.Pioneer:
            return decidePioneer(creep, assignment, room);
        default:
            return { kind: ActionKind.Idle, reason: "unknown-kind" };
    }
}

function perform(creepName: string, action: Action): void {
    if (action.kind === ActionKind.Idle) {
        idleTally[action.reason] = (idleTally[action.reason] ?? 0) + 1;
        return;
    }
    if (action.kind === ActionKind.MoveTo) {
        requestMove(creepName, action.pos, action.range);
        return;
    }
    const creep = Game.creeps[creepName];
    if (!creep) {
        return;
    }
    let rc: number = OK;
    switch (action.kind) {
        case ActionKind.Harvest: {
            const target = resolve(action.targetId);
            rc = target ? creep.harvest(target) : OK;
            break;
        }
        case ActionKind.Pickup: {
            const target = resolve(action.targetId);
            rc = target ? creep.pickup(target) : OK;
            break;
        }
        case ActionKind.Transfer: {
            const target = resolve(action.targetId);
            rc = target ? creep.transfer(target, action.resource) : OK;
            break;
        }
        case ActionKind.Drop:
            rc = creep.drop(action.resource);
            break;
        case ActionKind.Withdraw: {
            const target = resolve(action.targetId);
            rc = target ? creep.withdraw(target, action.resource) : OK;
            break;
        }
        case ActionKind.Build: {
            const target = resolve(action.targetId);
            rc = target ? creep.build(target) : OK;
            break;
        }
        case ActionKind.Repair: {
            const target = resolve(action.targetId);
            rc = target ? creep.repair(target) : OK;
            break;
        }
        case ActionKind.Attack: {
            const target = resolve(action.targetId);
            rc = target ? creep.attack(target) : OK;
            break;
        }
        case ActionKind.ReserveController: {
            const target = resolve(action.targetId);
            rc = target ? creep.reserveController(target) : OK;
            break;
        }
        case ActionKind.ClaimController: {
            const target = resolve(action.targetId);
            rc = target ? creep.claimController(target) : OK;
            break;
        }
        case ActionKind.Upgrade: {
            const target = resolve(action.targetId);
            rc = target ? creep.upgradeController(target) : OK;
            break;
        }
    }
    if (rc !== OK && rc !== ERR_TIRED) {
        log.debug(SubsystemId.CreepExecution, () => `${creepName} ${action.kind} → ${rc}`);
    }
}

/** The class-A entry, after the per-room planners, before movement resolution. */
export function runAll(ctx: TickContext): void {
    for (const creep of ctx.snapshot.myCreeps) {
        if (creep.spawning) {
            continue;
        }
        const assignment = (creep.memory as { assignment?: Assignment }).assignment;
        if (!assignment) {
            idleTally.unassigned = (idleTally.unassigned ?? 0) + 1;
            continue;
        }
        perform(creep.name, decide(creep, assignment, ctx));
    }
    if (ctx.snapshot.time % 100 === 0) {
        const entries = Object.entries(idleTally);
        if (entries.length > 0) {
            log.info(SubsystemId.CreepExecution, () => `idle tallies: ${entries.map(([r, n]) => `${r}=${n}`).join(" ")}`);
            for (const [reason] of entries) {
                delete idleTally[reason];
            }
        }
    }
}
