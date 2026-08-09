# Creep Execution Design

Status: draft — M2, revised after fresh-context review
Parent: [architecture.md](architecture.md) §5.11 (also §3 principle 2 — executors never write assignments).

## Goal

The thin doing-layer: read each creep's assignment, run the small state machine for that
kind, emit game intents and movement requests. No decisions beyond micro-execution.
Success criteria:

- Every executor is a pure function returning exactly one `Action`, with unit tests per
  state; the adapter that performs Actions is a dumb switch.
- A creep with a broken assignment idles cheaply and visibly — never improvises.

## Interface

```ts
// src/creeps/actions.ts — internal to this subsystem
export enum ActionKind { Harvest, Pickup, Transfer, Drop, Upgrade, MoveTo, Idle }  // string enum in code
export type Action =
    | { kind: ActionKind.Harvest; targetId: Id<Source> }
    | { kind: ActionKind.Pickup; targetId: Id<Resource> }
    | { kind: ActionKind.Transfer; targetId: Id<AnyStructure>; resource: ResourceConstant }
    | { kind: ActionKind.Drop; resource: ResourceConstant }
    | { kind: ActionKind.Upgrade; targetId: Id<StructureController> }
    | { kind: ActionKind.MoveTo; pos: Pos; range: number }
    | { kind: ActionKind.Idle; reason: string };

// src/creeps/executors/*.ts — one pure executor per AssignmentKind.
// upgradeSpot comes from economy's accessor (getUpgradeSpot — the §6-blessed read);
// undefined (economy never ran yet) degrades as specced below.
export function decideMine(creep: CreepView, a: MineAssignment, room: RoomSnapshot): Action;
export function decideHaul(creep: CreepView, a: HaulAssignment, room: RoomSnapshot, upgradeSpot: Pos | undefined): Action;
export function decideUpgrade(creep: CreepView, a: UpgradeAssignment, room: RoomSnapshot, upgradeSpot: Pos | undefined): Action;

// src/creeps/index.ts — the class-A entry (global over ctx.snapshot.myCreeps — creeps
// may leave owned rooms from M5): skip spawning creeps; dispatch on
// memory.assignment.kind → executor → perform(Action). perform maps to game calls via
// snapshot handles (resolve<T>) and routes MoveTo to movement.requestMove. Uses the
// creep's current room view (snapshot.room(pos.roomName)); no view → Idle("no-vision").
```

One Action per creep per tick: the work intent when in range, else MoveTo — never both.
Range checks are chebyshev on view positions. All "nearest/biggest" choices are argmax
over an explicit candidate list inside one pure function — the only scoring the
architecture permits (§4).

## The state machines (entire M2 policy)

- **Mine**: source by id from `room.sources` (gone → Idle). In range 1 → `Harvest`
  (drop-mining; miners carry no CARRY). Else `MoveTo(source, 1)`.
- **Haul**, by store:
  - Empty → biggest dropped-energy pile within range 2 of the assigned source, ignoring
    piles < `minPickup` (20). In range 1 → `Pickup`; else `MoveTo(pile, 1)`. No pile →
    **stage off the seats**: if within range 1 of the source (a miner seat), step back
    (`MoveTo(source, 2)`); otherwise Idle — idle ferries must not squat mining tiles
    (M2 has no shove).
  - Carrying → nearest spawn/extension with free energy capacity: `Transfer` in range 1
    / `MoveTo(target, 1)`. All full → the upgrade pile: within range 1 of `upgradeSpot`
    → `Drop`; else `MoveTo(upgradeSpot, 1)`. (Range 1, not 0 — the spot is the
    upgraders' seat; demanding the exact tile was reviewed out as a livelock.) No
    `upgradeSpot` yet → Idle("no-spot").
- **Upgrade**, by store:
  - Empty → biggest dropped-energy pile within range 4 of `upgradeSpot` (or of the
    controller when the spot is undefined): `Pickup` in range 1 / `MoveTo(pile, 1)`.
    None → Idle (the pile refills from haulers; walking to sources is economy.md's
    explicitly rejected alternative).
  - Carrying → controller in range 3 → `Upgrade`; else `MoveTo(controller, 3)`
    (controller pos/id are on `ControllerView` — the M2 view extension).

Idle is always legal and free. The adapter counts idles per reason in a per-tick tally
logged at Info every 100 ticks when nonzero — visible at default log level without
per-creep spam; proper window counters land with telemetry's extended stats (class C).

## Memory Schema

None. Executors read `CreepMemory.assignment` via the snapshot's live memory reference
and write nothing — invalid assignments surface as Idle and heal by replacement
(architecture §5.11).

## Tick Flow

Class A, global, after the per-room planners and before movement resolution (normative
order). Cost is dominated by emitted intents (~0.2 each) — the currency of economy.md's
workforce cap (principle 8). `perform` details: `resolve<T>(id)` returning null (target
died this tick) → Idle, not an error; return codes other than OK/ERR_TIRED log at Debug
and wait for next tick's fresh decision — no retries, no state.

## Edge Cases

- **No assignment / unknown kind** (pre-M2 creep, future kind after rollback): Idle
  ("unassigned") — counted, never fatal.
- **Assigned room not visible**: Idle("no-vision") — the M5 seam for remote execution.
- **Target died mid-tick / pile taken**: null resolve or empty pile → Idle → next tick
  re-decides. Two haulers may race one pile; the loser wastes one pickup intent.
  Reservation ledgers are v1's disease — accepted micro-waste (§4).
- **upgradeSpot undefined** (first ticks of a fresh room before economy runs): haulers
  spawn-deliver (spawn is never full while spawning) and upgraders don't exist yet —
  degraded but sound.
- **Fatigued creep**: MoveTo still issued; movement skips fatigued creeps without
  stuck-counting (movement.md).

## Test Plan

Unit (pure executors, mocked views):

- Mine: out of range → MoveTo(1); in range → Harvest; missing source → Idle.
- Haul: empty+pile → Pickup/MoveTo; empty+no-pile on a seat → step-back MoveTo(2);
  off-seat → Idle; carrying+spawn-free → Transfer; carrying+all-full → Drop within
  range 1 of spot / MoveTo(spot, 1); undefined spot → Idle("no-spot").
- Upgrade: empty+pile → Pickup; carrying in range 3 → Upgrade; carrying far →
  MoveTo(controller, 3); undefined spot falls back to controller-relative pile scan.
- Dispatch: unassigned → Idle; spawning skipped; perform maps every ActionKind to the
  right stubbed game call; null resolve → no call, no throw.

Sim: the M2 gate — sources near-zero at regen boundaries (miners saturate), spawn stays
fed, progress strictly grows.
