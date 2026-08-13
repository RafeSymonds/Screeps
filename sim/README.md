# Headless simulation (`bin/sim`)

Run the **real bot** in the **real Screeps engine**, headless, on the **same Node major
as production (Node 24)** — no Steam client, no screeps.com account. This is for watching
how the bot actually behaves over many ticks (economy bootstrap, spawn pressure, CPU),
not for assertions. For fast pure-logic checks keep using `npm run test`.

```bash
bin/sim run                          # 150 ticks, fresh RCL1 room (default scenario)
bin/sim run 400 --every 25           # longer run, state line every 25 ticks
bin/sim run --scenario full-base     # mature RCL8 room, full structures + workforce
bin/sim run --scenario under-attack  # defended base + a wave of hostile creeps
bin/sim run --verbose                # bot console every tick + final Memory dump
bin/sim test                         # behavioral regression tests (real engine)
bin/sim build                        # (re)build the engine image
bin/sim shell                        # shell into the engine container (debugging)
bin/sim clean                        # remove the engine image
```

Each `run` rebuilds the bot (`npm run build`), boots the engine in Docker, ticks the
world to completion, prints what happened, and exits. It is a batch tool, not a daemon.

Containers are ephemeral: every container runs with `--rm` and a unique `--name`, and
`bin/sim` traps signals to force-remove it — so nothing is left running after a normal exit,
a `Ctrl-C`, a `timeout`, or a kill. (The `screeps-sim` image is kept for reuse; drop it with
`bin/sim clean`.)

## Example output

```
[t  51] W1N1/bot: creeps=1 {"worker":1} RCL1(up=0) spawn=150 ext=0/0 cont=0/0 stor=0 towers=0 sites=2 src=5950 cpu=2.00
[t 151] W1N1/bot: creeps=2 {"worker":2} RCL1(up=0) spawn=109 ...
[t 251] W1N1/bot: creeps=3 {"worker":3} RCL1(up=0) spawn=109 ... src=5714 cpu=2.00
```

Each line is real engine state for a room: creep count + role breakdown (inferred from
body), controller level/upgrade progress, spawn/extension/container/storage energy, tower
and construction-site counts, remaining source energy, and the bot's CPU for that tick.

## How it works

- [`screeps-server-mockup`](https://github.com/screepers/screeps-server-mockup) embeds the
  actual `@screeps/engine` + `@screeps/driver` and ticks it one step at a time. The bundled
  `dist/main.js` is loaded as the bot's `main` module (plus `main.js.map` so thrown errors
  map back to TypeScript).
- The harness lives in [`run.js`](run.js); the world is built by a scenario in
  [`scenarios/`](scenarios). [`scenarios/default.js`](scenarios/default.js) is a fresh RCL1
  room (controller, two sources, an owned spawn with 300 energy) — the canonical "can the
  bot bootstrap from scratch?" world.

## Why Docker / Node version pinning

The stock `screeps-server-mockup` npm release pins the ancient `isolated-vm@2.x` engine,
which only builds on Node ≤12. We instead install the mockup's **git master** (the
maintainers added Node-24 support there) with **`@screeps/driver@5.3.0`** — the
`feat-node24` driver that compiles a patched `isolated-vm` from git. That native build (and
matching the production Node major) is why the engine runs in a container, not on the host
(which is Node 25). The first `bin/sim build` compiles `isolated-vm` and takes a few minutes;
later runs reuse the image.

Two Node-24 fixes the harness applies at startup (see the top of `run.js`):
- `localhost` → IPv4: `@screeps/storage` binds `localhost` (IPv6 `::1` first on Node 17+)
  while the driver dials `127.0.0.1`, so without this the driver gets `ECONNREFUSED` forever.
- the brief storage-reconnect noise before the storage port binds is suppressed.

## Scenarios

A scenario is a starting world state. They live in `scenarios/` and are selected with
`--scenario <name>` (the name is the filename without `.js`):

| scenario       | what it sets up                                                            |
| -------------- | ------------------------------------------------------------------------- |
| `default`      | fresh RCL1 room (controller, 2 sources, owned spawn) — bootstrap from zero |
| `full-base`    | RCL8 room: 3 spawns, 60 extensions, 6 towers, storage, terminal, links, labs, all energy filled, + 10 creeps |
| `under-attack` | defended RCL7 base (3 towers, safe mode off) + a wave of hostile melee creeps owned by an enemy player |

## Regression tests (`bin/sim test`)

Behavioral tests in `tests/` assert on long-term behavior by running a scenario for many
ticks and checking the timeline of real engine state — economy growth, defense, structure
retention, CPU bounds, no crashes. They run the **real engine in Docker** (slower than the
host-side `npm run test`, which is pure-logic mocks), so they're a separate suite:

```bash
bin/sim test                  # run all
bin/sim test -- --grep defense  # only matching
```

**Two tiers.** `bin/sim test` runs the FAST suite (`tests/`): staged scenarios that
seed each era's starting state (`rcl2-base`, `infra-built`, …) so every suite proves
one behavior in ≤ 900 ticks — the whole thing is a few minutes of wall clock and is
the iteration loop. `bin/sim test --full` adds the FULL-ARC suites (`tests-full/`):
the same behaviors proven end-to-end from scratch over thousands of ticks (~40 min)
— run before every milestone commit. Staged gates prove stages; only the full arc
proves the hand-offs between them, which is why both exist.

The files run **in parallel, one scenario suite per file** (`mocha --parallel`, workers
tuned by `SIM_JOBS`, default 4; `SIM_JOBS=1` restores serial for debugging). Each
`runScenario` isolates its own server, port range (pid-derived), and storage dir, so
workers never collide; wall clock ≈ the slowest single suite instead of the sum (the
July 2026 "parallel degrades 3×" note predated the rebuild's CPU allotment and is
retired). More speed levers in the harness: single-room scenarios skip neighbor-room
seeding (each seeded room is a per-tick processor sweep — ~20% of tick time measured;
`SIM_NEIGHBOR_RADIUS` still overrides), notifications drain every 10 ticks instead of
every tick, and multi-room scenarios fork a second engine processor. Iterate on ONE
suite with `-- --grep <name>`. Keep each scenario's tick count to the minimum that
proves the behavior — engine ticks are ~the only cost (~0.2-0.3s each).

### The bundle is snapshot, not mounted (Aug 2026)

`bin/sim` copies `dist/main.js` into a run-private temp directory and mounts THAT as
`/bot`, rather than bind-mounting `dist/` itself.

rollup's `clear({targets:["dist"]})` wipes `dist/` at the start of **every** build — which
includes `npm run build` and every `./deploy`. With `dist/` mounted live, any build started
while a run was in flight deleted the bundle out from under it, and every suite that had not
yet loaded it died with `bot bundle not found at /bot/main.js`. That destroyed three
separate gate runs before it was diagnosed, and the failure looks nothing like its cause —
it reads as a broken harness rather than "somebody rebuilt".

The snapshot costs about a megabyte and makes a run immune to whatever else the repo is
doing, so you can build, deploy, or keep editing while a gate runs.

### Known flake (Aug 2026, unresolved)

`fast: post-infrastructure rate → does not let energy rot on the ground` has failed once
in two full parallel runs while passing standalone (2/2, settling at 1 pile / <200 energy
against a 1500 bound). In the failing run the room never staffed up — ground energy was a
symptom, not the fault.

**Mechanism unknown. CPU shedding is ruled out**, despite being the obvious guess: a clean
run's telemetry shows `s: 0` on every entry in every window, `minBucket: 10000`, and
`avgCpu ≈ 2.5`. The bot never sheds anything at these levels, so host contention is not
reaching the scheduler's gates.

The leading remaining suspect is a **runtime-killed tick** under `SIM_JOBS` contention.
That was previously invisible here: the driver writes such a kill to the console without
ErrorMapper's red span and raises no notification, so it looked exactly like a quiet,
successful tick while the bot did a fraction of its work. `runScenario` now returns
`runtimeKills` (console lines matching terminated/timed-out/interrupted/CPU-limit) and
**every suite asserts it is empty**, so if that is the cause the next failure will name it.

If a gate fails once, re-run it standalone or with `SIM_JOBS=1` before treating it as a
regression — and if the flake reappears with `runtimeKills` still empty, the hypothesis is
wrong and the next place to look is engine-side nondeterminism, not the bot.

Tests use the shared `lib/harness.js`:

```js
const { runScenario, seriesOf, finalOf } = require("../lib/harness");
const res = await runScenario({ scenario: "default", ticks: 180, every: 10 });
// res.timeline    : per-snapshot state (same fields you watch in `bin/sim run`)
// res.notifications: every engine notification (incl. game events like "controller upgraded")
// res.engineErrors : error-shaped notifications only (script errors, module load failures)
// res.botErrors    : exceptions the bot caught (ErrorMapper red-span console lines)
// seriesOf(res.timeline, "W1N1", "bot", "creeps") -> [1,1,2,3,...]
// finalOf(res.timeline, "W1N1", "bot")            -> last snapshot's stats
```

Each `runScenario` uses a fresh storage port + dir, so suites run back-to-back safely. Add a
test by dropping `tests/<name>.test.js` (mocha + chai); it's bind-mounted, no rebuild needed.
Current suites: `economy` (bootstrap grows + harvests + CPU-bounded), `defense` (towers clear
a hostile wave, spawns survive), `full-base` (RCL8 stays intact, CPU-bounded at scale).

## Authoring scenarios

A scenario file exports `setup(server, { TerrainMatrix, modules })` and returns
`{ rooms: string[], bots: { <name>: <userEmitter> } }`. `modules` is the bundled bot — pass
it to `server.world.addBot(...)`. See `default.js` (raw mockup API) and `full-base.js` /
`under-attack.js` (using the builder).

Most scenarios should use **`scenarios/_world.js`**, a builder whose structure/creep shapes
mirror what `@screeps/engine` actually writes, with all capacities/hits read from the live
engine constants. Key helpers (`const W = require("./_world")`):

- `W.resetWorld(server)`, `W.freshRoom(server, room, terrain?)`
- `W.addController/addSource/addMineral(server, room, x, y, ...)`
- `W.addStructure(server, room, type, x, y, { user, level, energy, name })` — any structure
  (`spawn`, `extension`, `tower`, `storage`, `terminal`, `link`, `lab`, `container`,
  `rampart`, `constructedWall`, `road`, `extractor`, `observer`, `powerSpawn`, `factory`, `nuker`)
- `W.setController(server, room, user, level, opts)` — force RCL/owner/safe mode
- `W.addUser(server, username)` — create a non-bot (enemy) user, returns its id
- `W.addCreep(server, room, x, y, user, body, opts)` — place a live creep
- `W.fullBase(server, room, botId, { level, center, creeps })` — a whole base in one call
- `W.addHostiles(server, room, enemyId, count, { near, body })` — drop attackers
- `W.Placer(box, { checkerboard, used })` — hand out distinct free tiles

`addBot` must run **after** the room has a controller (it claims it at RCL1 and drops an owned
spawn at `x,y`); call `W.fullBase` / `W.setController` afterward to mature it. Files starting
with `_` are helpers, not selectable scenarios.

Neighbor rooms get all-plains terrain seeded around each scenario room so cross-border
pathfinding works (the real map has terrain everywhere). The default radius is 1 (the 8
adjacent rooms) — enough for in-room edge probing and cheap. Bump it for wide multi-room
pathfinding with `SIM_NEIGHBOR_RADIUS=2 bin/sim run …` (forwarded into the container).

Run `/build-scenario` (the project skill) to have an agent author a new one for you.
