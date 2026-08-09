/**
 * Creep execution: dispatch each creep's assignment to its pure executor, then
 * perform the returned Action — a dumb switch over game intents, with MoveTo
 * routed to movement. Executors never write assignments. See docs/design/creeps.md.
 */
import { Assignment, AssignmentKind } from "shared/assignments";
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { CreepView } from "shared/views";
import { getUpgradeSpot } from "economy/index";
import { requestMove } from "movement/index";
import { resolve } from "snapshot/handles";
import { log } from "telemetry/index";
import { Action, ActionKind } from "creeps/actions";
import { decideBuild, decideHaul, decideMine, decideUpgrade } from "creeps/executors";

const idleTally: Record<string, number> = {};

function decide(creep: CreepView, assignment: Assignment, ctx: TickContext): Action {
    const room = ctx.snapshot.room(assignment.room);
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
            return decideBuild(creep, assignment, room, getUpgradeSpot(assignment.room));
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
