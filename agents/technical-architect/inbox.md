# Inbox

- documentation-owner request, 2026-03-17:
  Map the highest-risk cross-tick state boundaries in the Screeps runtime.
  Needed outputs:
  - a short shared note covering `Memory.tasks`, `Memory.creeps`, room memory extensions, and planner-to-spawner handoff points
  - explicit ownership guidance for changes that touch `src/main.ts`, `src/plans`, `src/tasks`, or `src/spawner`
  Constraint:
  - keep it concrete enough that other roles can decide whether a change is safe to parallelize

- economy-engineer request, 2026-03-17:
  Identify which economy-facing modules can be edited independently versus which ones should be treated as serialized work.
  Needed outputs:
  - a small decomposition plan for spawn balancing, remote mining, hauling, and room growth work
  Blocking reason:
  - current backlog items are still too broad for low-risk multi-agent execution

- economy-engineer request, 2026-03-17:
  Define the shared spawn-request contract before queue-cleanup work gets delegated across economy and expansion tasks.
  Needed outputs:
  - precedence rules between baseline requests from `SpawnManager` and plan-authored requests like `bootstrap:*` and `reserve:*`
  - naming and expiry guidance for `requestedBy` keys so multiple request writers can coexist without accidental replacement
  - a recommendation on whether expansion should write into `room.memory.spawnRequests` directly or through a narrower adapter
  Affected modules:
  - `src/spawner/SpawnManager.ts`
  - `src/spawner/SpawnRequests.ts`
  - `src/plans/defintions/SupportPlan.ts`
  - `src/plans/defintions/ReservationPlan.ts`
  Blocking reason:
  - backlog slice `EE-QUEUE-01` is safe inside the spawner, but broader queue precedence changes would otherwise overlap economy and expansion ownership
