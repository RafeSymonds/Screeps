# Deployment Checklist — first MMO run

Status: written for the first live deploy (M6 complete, never deployed)
Parent: [design/architecture.md](design/architecture.md) §2 "Definition of it works", §9 (CPU budget),
[design/telemetry.md](design/telemetry.md) (every metric below).

The bot is gated in sim across M1–M6 and has never executed a tick on a real server. This
is the checklist for that first run and the week that follows. Architecture §2's seven-day
unattended criteria are a **deployment checklist, not a sim gate** — this file is it.

---

## 0. Before you push

- [ ] `screeps.json` exists (copy [../screeps.sample.json](../screeps.sample.json), fill in
      the `main` token). It is gitignored and must never be committed.
- [ ] `npm run build` clean.
- [ ] `npm run test` green.
- [ ] `bin/sim test` green (36/36). Re-run once if a single gate fails — see
      "Known flake" at the bottom.
- [ ] Working tree committed, so the deployed bundle maps to a known commit.

Push: `npm run push-main`.

**The one human touchpoint** (architecture §2): placing the first spawn in the UI after
account respawn. Nothing in the bot does this and nothing should.

---

## 1. First 10 ticks — is it alive?

Watch the in-game console. Expect near-silence: default log level is `Info`, and the
subsystems only speak when something is decided or wrong.

- [ ] No red uncaught exceptions. An escaped throw appears source-mapped via
      `ErrorMapper` — the file/line is real, not bundle offsets.
- [ ] `Memory.version === 1`.
- [ ] `Memory.shell.owned` lists your room.
- [ ] `Memory.stats` exists with `counters.resets >= 1` (the first tick on a fresh heap
      always counts one reset — that is correct, not a fault).

If the tick throws immediately, the fastest triage is `Memory.stats.counters.errors` plus
raising the log level (below) — not redeploying.

**Console controls, no deploy needed:**

```js
Memory.stats.logLevel = 0   // Debug — everything, including per-creep intent failures
Memory.stats.logLevel = 1   // Info (default)
Memory.stats.logLevel = 2   // Warn
```

Turn Debug back off once you are done. It is cheap (thunks are not evaluated below level)
but the console output itself is not free at 20+ creeps.

---

## 2. First ~300 ticks — is the economy standing up?

The bootstrap sequence, in the order it should appear:

- [ ] A miner spawns first, then a hauler (priorities 1 and 2 — economy.md).
- [ ] Bodies are small at first. This is deliberate: while income staffing is below floor
      every body is sized to 300 energy, because a wiped high-cap room otherwise drains its
      stores on one full-cap creep and wedges. Bodies grow once miners and haulers stand.
- [ ] `Memory.rooms.<room>.econ` appears (upgrade spot + source seat counts).
- [ ] `Memory.rooms.<room>.layout` appears with a non-`-1` anchor. `anchor === -1` means the
      room was judged unplannable — investigate, that should not happen in a normal room.
- [ ] Construction sites start appearing after RCL2, extensions first.

```js
// One-liner room health check
JSON.stringify(Memory.rooms[Object.keys(Memory.rooms)[0]])
```

---

## 3. First 1000 ticks — the numbers that matter

`Memory.stats.ring` holds `RING_SIZE = 11` windows of `FLUSH_INTERVAL = 100` ticks each —
about 1100 ticks of history. **This is why the seven-day criteria are judged from the
cumulative counters, not the ring**: the ring is a rolling recent view and will have
wrapped many times over by day 7.

```js
// Most recent window
Memory.stats.ring[(Memory.stats.head - 1 + Memory.stats.ring.length) % Memory.stats.ring.length]
```

Each window carries `{t, ticks, avgCpu, maxCpu, minBucket, entries}` where `entries` is
keyed by SubsystemId with compact fields — `c` cpu, `r` runs, `s` skips, `e` errors.

- [ ] `avgCpu` well under `Game.cpu.limit` (20 on official MMO). §9 budgets ≤ 2 for
      shell+snapshot+scheduler+telemetry and ≤ 2.5 per owned room all-in.
- [ ] `minBucket` recovering toward 10000, not grinding down.
- [ ] `entries[*].s` (skips) near zero for class-B entries. Sustained class-B skipping means
      CPU pressure is already shedding work that wants to run every tick.
- [ ] `entries[*].e` zero everywhere.

**Record the per-entry CPU numbers.** They are the input to calibrating principle 8's CPU
allowance, which is the thing currently pinning `maxRemotesPerHome` at 1.

---

## 4. The seven-day criteria (architecture §2)

Judged from cumulative counters, which survive resets:

| Criterion | Where | Pass |
| --------- | ----- | ---- |
| Zero uncaught exceptions | `Memory.stats.counters.errors` | `0` |
| Zero rooms lost | `Memory.shell.lostAt` empty; no `roomLost` notify | `{}` |
| Average CPU ≤ 80% of limit | ring `avgCpu`, sampled | `≤ 16` at limit 20 |
| Global resets in a sane band | `Memory.stats.counters.resets` vs `counters.ticks` | see below |
| Spawn uptime above threshold | **not implemented** | see gap below |

**Resets**: a global reset is normal and frequent in Screeps — the VM is recycled
routinely. What matters is the *rate*. `ResetLoop` alerts fire at 3 resets inside 1000
ticks; if you are not receiving those, the rate is sane.

**Gap to be honest about**: architecture §2 requires "spawn uptime above a threshold set in
the telemetry doc". The telemetry doc never sets that threshold and no spawn-uptime metric
is implemented. Four of the five criteria are measurable today; this one is not. It needs a
counter (ticks with a spawn idle while demands were pending / total ticks) before the §2
checklist can be fully signed off.

---

## 5. Alerts — what will email you

`Game.notify`, deduped per kind for `ALERT_DEDUPE_TICKS = 1000`, grouped 30 minutes.

| Kind | Means | Action |
| ---- | ----- | ------ |
| `errorBurst` | >10 errors in one window | Read `entries[*].e` to find the subsystem; log level 0 |
| `cpuCeiling` | window avg > 90% of limit | Real problem — see rollback below |
| `resetLoop` | 3 resets within 1000 ticks | Usually a throw on a hot path; check `counters.errors` |
| `roomLost` | a room left `shell.owned` | Attack, or a downgrade you did not notice |
| `discontinuity` | respawn, or Memory from a different schema/bot | Expected on redeploy after a version bump |
| `corruptSlice` | a Memory container failed its shape check | Slice was reinitialized; note which one |
| `safeMode` | safe mode fired | You are under real attack |
| `expansionStalled` | pioneering past timeout | Claimed room is not standing up on its own |

Alerts dedupe by kind, so one noisy kind will not suppress another.

---

## 6. When to roll back

Roll back — redeploy the previous commit — if any of these hold after ~500 ticks:

- Uncaught exceptions every tick (the bot is not running at all).
- `resetLoop` firing repeatedly: a throw is killing the VM faster than work gets done.
- `avgCpu` pinned above the limit with `minBucket` monotonically falling: the bucket is
  draining and will not recover, so the bot will start losing whole ticks.
- Rooms lost to something other than an attack.

**A redeploy with a `CURRENT_VERSION` bump wipes Memory** outside `KEEP_ON_RESET`
(`intel`, `stats`, `version`) — by design, there is no migration path (shell.md). A
rollback to an older schema version triggers the same reset in the other direction. Both
are survivable and both alert `discontinuity`. Intel and stats survive, so you keep your
scouted map and your evidence trail.

Do **not** hand-edit Memory to "fix" a bad state. The bootstrap heals containers every
tick and the continuity check will interpret a hand-made state as a discontinuity.

---

## 7. Known flake in the pre-deploy gate

`bin/sim test` intermittently fails `fast: post-infrastructure rate → does not let energy rot
on the ground` — observed once in two full parallel runs, and passing 2/2 standalone, where
it settles at 1 pile / <200 energy against a 1500 bound.

**The mechanism is not yet known.** CPU shedding was the obvious suspect and is *ruled out*:
telemetry from a clean run shows `s: 0` (zero skips) on every entry in every window,
`minBucket: 10000`, and `avgCpu` around 2.5 — the scheduler never sheds anything in the sim.
The leading remaining suspect is a runtime-killed tick under `SIM_JOBS` contention, which
until now was invisible to the harness (a killed tick raises no notification and carries no
ErrorMapper red span, so it looked identical to a quiet successful one). Every suite now
asserts `res.runtimeKills` is empty, so if that is the cause the next occurrence will say so.

If it fires: re-run, or `SIM_JOBS=1 bin/sim test`. The assertion now prints pile counts,
creep counts and hauler counts alongside the energy series — a room that never reached ~5
haulers failed upstream of hauling, and the pile is a symptom rather than the bug.

This does not block deploying. It is a sim-harness question, and the shedding logic it was
mistakenly blamed on is separately and deterministically unit-tested (`scheduler/gates.ts`
is pure, with an injected meter).
