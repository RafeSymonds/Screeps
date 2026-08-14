/**
 * Creep execution: dispatch each creep's assignment to its pure executor, then
 * perform the returned Action — a dumb switch over game intents, with MoveTo
 * routed to movement. Executors never write assignments. See docs/design/creeps.md.
 *
 * ## The two halves
 *
 * `decide` is the shell around the pure executors: it handles everything that
 * needs cross-room or cross-creep context (which room am I working, is it safe,
 * am I straddling a border, do I own the container seat) and then hands a single
 * room's view to a pure function. `perform` is deliberately mindless — it maps an
 * Action to exactly one game call and nothing else.
 *
 * Keeping those apart is what stops creep logic from sprawling. Any question that
 * can be answered from one room's data belongs in `executors.ts` where it is
 * testable; anything needing the whole world lands here.
 *
 * ## Assignments are input, never output
 *
 * The workforce planner (economy) writes `creep.memory.assignment`; this module
 * only reads it. That one-way flow is why a creep cannot quietly reassign itself
 * and drift out of the planner's headcount — if behavior looks wrong, exactly one
 * subsystem wrote the decision.
 */
import { Assignment, AssignmentKind } from "shared/assignments";
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";
import { CreepView, Pos, RoomSnapshot } from "shared/views";
import { fortificationTargets } from "defense/index";
import { FortifyTarget } from "defense/fortify";
import { ECONOMY_CONFIG } from "economy/config";
import { getUpgradeSpot } from "economy/index";
import { RepairTarget, computeRepairTargets } from "economy/repair";
import { isUnsafe } from "intel/index";
import { requestMove } from "movement/index";
import { resolve } from "snapshot/handles";
import { getTerrain } from "snapshot/terrain";
import { log } from "telemetry/index";
import { Action, ActionKind } from "creeps/actions";
import { decideDefend, decideHaul, decideMine, decideWork } from "creeps/executors";
import { EnergyLedger, createLedger } from "creeps/ledger";
import { assignSeats, seatTiles } from "creeps/seats";

/** Why creeps did nothing, tallied by reason and logged periodically. Idleness is
 *  the symptom every economy bug shows up as first, so the reason string is the
 *  cheapest diagnostic in the bot — "no-pile=12" says more than a CPU graph. */
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

/** Per-tick memo: which worker holds the room's guaranteed upgrader seat.
 *  Lowest name wins — arbitrary but STABLE, so the seat does not change hands
 *  every tick. See the upgrade-floor note in decideWork. */
let upgraderTick = -1;
const upgraderMemo = new Map<string, string | undefined>();
let repairerTick = -1;
const repairerMemo = new Map<string, string | undefined>();

function workerSeatsFor(ctx: TickContext, roomName: string): string[] {
    return ctx.snapshot.myCreeps
        .filter(c => {
            const a = (c.memory as { assignment?: { kind?: string; room?: string } }).assignment;
            return a?.kind === AssignmentKind.Work && a.room === roomName && !c.spawning;
        })
        .map(c => c.name)
        .sort();
}

function dedicatedUpgraderFor(ctx: TickContext, roomName: string): string | undefined {
    if (upgraderTick !== ctx.snapshot.time) {
        upgraderMemo.clear();
        upgraderTick = ctx.snapshot.time;
    }
    if (upgraderMemo.has(roomName)) {
        return upgraderMemo.get(roomName);
    }
    const owner = workerSeatsFor(ctx, roomName)[0];
    upgraderMemo.set(roomName, owner);
    return owner;
}

/** The room's single routine-repair seat: the SECOND worker by name, so it never
 *  collides with the upgrader seat. One room with one worker upgrades and does not
 *  repair — correct, since a lone worker keeping RCL alive matters more. */
function dedicatedRepairerFor(ctx: TickContext, roomName: string): string | undefined {
    if (repairerTick !== ctx.snapshot.time) {
        repairerMemo.clear();
        repairerTick = ctx.snapshot.time;
    }
    if (repairerMemo.has(roomName)) {
        return repairerMemo.get(roomName);
    }
    const owner = workerSeatsFor(ctx, roomName)[1];
    repairerMemo.set(roomName, owner);
    return owner;
}

/** Per-tick memo: maintenance repair targets, scanned once per room not per creep. */
let repairTick = -1;
const repairMemo = new Map<string, RepairTarget[]>();

function repairFor(ctx: TickContext, roomName: string): RepairTarget[] {
    if (repairTick !== ctx.snapshot.time) {
        repairMemo.clear();
        repairTick = ctx.snapshot.time;
    }
    let targets = repairMemo.get(roomName);
    if (!targets) {
        const room = ctx.snapshot.room(roomName);
        targets = room ? computeRepairTargets(room) : [];
        repairMemo.set(roomName, targets);
    }
    return targets;
}

/** Structure types a creep cannot stand on — a seat under one is not a seat. */
const SEAT_BLOCKING: ReadonlySet<StructureConstant> = new Set<StructureConstant>([
    STRUCTURE_SPAWN,
    STRUCTURE_EXTENSION,
    STRUCTURE_TOWER,
    STRUCTURE_STORAGE,
    STRUCTURE_TERMINAL,
    STRUCTURE_FACTORY,
    STRUCTURE_OBSERVER,
    STRUCTURE_POWER_SPAWN,
    STRUCTURE_NUKER,
    STRUCTURE_LAB,
    STRUCTURE_LINK,
    STRUCTURE_EXTRACTOR,
    STRUCTURE_WALL
]);

/** Per-tick memo: sourceId → every miner's own seat tile. Computed once per
 *  source per tick because every miner of that source needs the same map, and
 *  they must all agree on it — recomputing per creep would be both wasteful and
 *  a chance to disagree. */
let seatTick = -1;
const seatMemo = new Map<string, Map<string, Pos>>();

function seatsFor(ctx: TickContext, room: RoomSnapshot, sourceId: string): Map<string, Pos> {
    if (seatTick !== ctx.snapshot.time) {
        seatMemo.clear();
        seatTick = ctx.snapshot.time;
    }
    const cached = seatMemo.get(sourceId);
    if (cached) {
        return cached;
    }
    const source = room.sources.find(s => s.id === sourceId);
    let assigned = new Map<string, Pos>();
    if (source) {
        const blocked = new Set<number>();
        for (const [type, views] of Object.entries(room.structures)) {
            if (!SEAT_BLOCKING.has(type as StructureConstant)) continue;
            for (const v of views ?? []) {
                blocked.add(v.pos.y * 50 + v.pos.x);
            }
        }
        const container = (room.structures[STRUCTURE_CONTAINER] ?? []).find(
            c => Math.max(Math.abs(c.pos.x - source.pos.x), Math.abs(c.pos.y - source.pos.y)) <= 1
        );
        const seats = seatTiles({
            source: source.pos,
            terrain: getTerrain(room.name),
            blocked,
            ...(container ? { container: container.pos } : {})
        });
        const miners = ctx.snapshot.myCreeps
            .filter(c => {
                const a = (c.memory as { assignment?: { kind?: string; sourceId?: string } }).assignment;
                return a?.kind === AssignmentKind.Mine && a.sourceId === sourceId && !c.spawning;
            })
            .map(c => ({ name: c.name, pos: c.pos }));
        assigned = assignSeats(seats, miners);
    }
    seatMemo.set(sourceId, assigned);
    return assigned;
}

/** How long a hauler stays home after finding its remote dry. Long enough to be
 *  useful at home, short enough to come back once mining resumes. */
const DRY_REMOTE_WAIT = 100;

/** Is there anything here an empty hauler could actually pick up? */
function hasCollectableEnergy(room: RoomSnapshot): boolean {
    const inContainers = (room.structures[STRUCTURE_CONTAINER] ?? []).some(
        c => (c.store?.byResource[RESOURCE_ENERGY] ?? 0) >= ECONOMY_CONFIG.minPickup
    );
    const onGround = room.dropped.some(d => d.resource === RESOURCE_ENERGY && d.amount >= ECONOMY_CONFIG.minPickup);
    const inStorage = (room.structures[STRUCTURE_STORAGE] ?? []).some(
        s => (s.store?.byResource[RESOURCE_ENERGY] ?? 0) >= ECONOMY_CONFIG.minPickup
    );
    return inContainers || onGround || inStorage;
}

/**
 * Which room is this creep's job in *right now*? Constant for every role except
 * hauling, where the answer flips with the load: an empty remote hauler belongs
 * at the remote's container, a full one belongs at home.
 *
 * The load half is derived from `store.used`, so the round trip needs no state —
 * a hauler that dies and is replaced mid-route needs no handover.
 *
 * The DRY-REMOTE half does need a scrap of state, and this is why. A remote whose
 * miner has died has nothing to collect, so an empty hauler sat there forever
 * (field-reported: "haulers get stuck in another room that has no energy, they
 * don't head back"). Deciding purely from what it can currently see does not work:
 * the moment it steps across the border it loses sight of the remote, the travel
 * rule sends it straight back, and it oscillates on the edge tile. So the "this
 * remote is dry" observation is stamped into creep scratch memory with an expiry —
 * durable enough to survive the walk home, self-clearing so mining resuming brings
 * the hauler back on its own.
 */
function workRoomOf(creep: CreepView, assignment: Assignment, ctx: TickContext): string {
    if (assignment.kind !== AssignmentKind.Haul) {
        return assignment.room;
    }
    if (creep.store.used > 0) {
        return assignment.to ?? assignment.room;
    }
    const home = assignment.to ?? assignment.room;
    if (home === assignment.room) {
        return assignment.room; // not a remote hauler; nothing to fall back to
    }
    const scratch = creep.memory as { dryUntil?: number };
    if ((scratch.dryUntil ?? 0) > ctx.snapshot.time) {
        return home;
    }
    // A remote with no energy and no miner STANDING IN IT is dry, whatever the
    // spawn queue intends. Counting a miner that is merely assigned there kept
    // haulers parked in an empty room for the length of the miner's walk — which
    // is hundreds of ticks — because "someone is on the way" reads exactly like
    // "someone is mining". Presence is the observable; intent is not.
    const minedByUs = ctx.snapshot.myCreeps.some(c => {
        const other = (c.memory as { assignment?: { kind?: string; room?: string } }).assignment;
        return (
            other?.kind === AssignmentKind.Mine && other.room === assignment.room && c.pos.roomName === assignment.room
        );
    });
    const view = ctx.snapshot.room(assignment.room);
    if (view && !minedByUs && !hasCollectableEnergy(view)) {
        const live = Game.creeps[creep.name];
        if (live) {
            live.memory.dryUntil = ctx.snapshot.time + DRY_REMOTE_WAIT;
        }
        return home;
    }
    return assignment.room;
}

/** The engine teleports ANY creep standing on a room-edge tile into the
 *  neighbouring room, every tick, unconditionally (engine: creeps/tick.js
 *  `isAtEdge`). A creep that idles or works there ping-pongs across the border
 *  forever — observed with scouts, which idle the instant they arrive, i.e. on
 *  the very tile they entered. Nothing legitimate sits at x/y 0 or 49 (the
 *  engine keeps sources and structures off those tiles), so stepping inward is
 *  always right. */
const atRoomEdge = (pos: { x: number; y: number }): boolean =>
    pos.x === 0 || pos.x === 49 || pos.y === 0 || pos.y === 49;

const centerOf = (roomName: string): { x: number; y: number; roomName: string } => ({ x: 25, y: 25, roomName });

/**
 * Everything a creep needs decided that a single room's view cannot answer, then
 * delegation to the pure executor for the rest.
 *
 * The preamble order is fixed and each rule earns its place: retreat from unsafe
 * rooms (before travelling into one), step off the border (only once arrived),
 * travel to the work room (without requiring vision of it), and only then decide
 * what to actually do there.
 */
function decide(creep: CreepView, assignment: Assignment, ctx: TickContext, ledger: EnergyLedger): Action {
    const workRoom = workRoomOf(creep, assignment, ctx);
    const home = (creep.memory as { home?: string }).home;

    // Retreat: never BE in, and never TRAVEL to, an unsafe work room. Checking
    // only "am I in it" made the creep bounce — it retreats one step across the
    // border, the travel rule immediately walks it back in, and it oscillates.
    if (workRoom !== home && isUnsafe(workRoom, ctx.snapshot.time)) {
        if (home && creep.pos.roomName !== home) {
            return { kind: ActionKind.MoveTo, pos: centerOf(home), range: 20 };
        }
        return { kind: ActionKind.Idle, reason: "retreated" };
    }
    // Step clear of the border, but ONLY once we are in the room we came for.
    // Keying this on the room the creep is standing in instead walks a creep
    // that is *leaving* back inside — it can never cross a border at all.
    if (creep.pos.roomName === workRoom && atRoomEdge(creep.pos)) {
        return { kind: ActionKind.MoveTo, pos: centerOf(workRoom), range: 20 };
    }
    // Travel preamble: outside the work room → walk there; needs no vision (the
    // M4 no-view→Idle rule deadlocked every creep whose job is somewhere unseen).
    if (creep.pos.roomName !== workRoom) {
        return { kind: ActionKind.MoveTo, pos: centerOf(workRoom), range: 20 };
    }
    // Standing in the work room: its view exists by definition.
    const room = ctx.snapshot.room(creep.pos.roomName);
    if (!room) {
        return { kind: ActionKind.Idle, reason: "no-vision" };
    }
    switch (assignment.kind) {
        case AssignmentKind.Mine:
            return decideMine(creep, assignment, room, seatsFor(ctx, room, assignment.sourceId).get(creep.name));
        // Room-scoped lookups key off the room being WORKED, not assignment.room:
        // a remote hauler delivering home has assignment.room = the remote, whose
        // upgrade spot is undefined — it arrived home loaded and lost both the
        // controller-feed tier and the drop fallback, and could only idle.
        case AssignmentKind.Haul:
            return decideHaul(creep, assignment, room, getUpgradeSpot(room.name), ledger);
        case AssignmentKind.Work:
            return decideWork(
                creep,
                assignment,
                room,
                getUpgradeSpot(room.name),
                fortifyFor(ctx, room.name),
                ledger,
                repairFor(ctx, room.name),
                dedicatedUpgraderFor(ctx, assignment.room) === creep.name,
                dedicatedRepairerFor(ctx, assignment.room) === creep.name
            );
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
        default:
            return { kind: ActionKind.Idle, reason: "unknown-kind" };
    }
}

/**
 * Turn one Action into one game intent. No decisions here by design — if this
 * function ever needs a branch on world state, that branch belongs in an executor.
 *
 * A vanished target resolves to `undefined` and is treated as OK rather than an
 * error: the object died between snapshot and intent, which is ordinary, and next
 * tick's decision will simply pick something else.
 */
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
    // One ledger per tick: creeps decide in sequence and see each other's claims,
    // so ten of them cannot all commit to the same 30-energy pile.
    const ledger = createLedger();
    for (const creep of ctx.snapshot.myCreeps) {
        if (creep.spawning) {
            continue;
        }
        const assignment = (creep.memory as { assignment?: Assignment }).assignment;
        if (!assignment) {
            idleTally.unassigned = (idleTally.unassigned ?? 0) + 1;
            continue;
        }
        perform(creep.name, decide(creep, assignment, ctx, ledger));
    }
    if (ctx.snapshot.time % 100 === 0) {
        const entries = Object.entries(idleTally);
        if (entries.length > 0) {
            log.info(
                SubsystemId.CreepExecution,
                () => `idle tallies: ${entries.map(([r, n]) => `${r}=${n}`).join(" ")}`
            );
            for (const [reason] of entries) {
                delete idleTally[reason];
            }
        }
    }
}
