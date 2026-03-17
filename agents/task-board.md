# Task Board

## Ready now

- technical-architect: audit the current planning and task pipeline for places where cross-tick state contracts are implicit, then document the highest-risk boundaries for future multi-agent work.
  Deliverable: update shared workflow docs with concrete ownership and escalation guidance for `Memory`, planning order, and spawn heuristics.
  Unblocks: safer parallel work across gameplay-facing roles.

- economy-engineer: review spawn, hauling, and remote-mining codepaths for the best first backlog slices that can be delegated without overlapping ownership.
  Deliverable: backlog refinement in the role folder with concrete candidate tasks and affected modules.
  Unblocks: cleaner queueing for economy and expansion work.

- operations-engineer: verify the orchestration tooling remains aligned with repo commands and local deployment paths.
  Deliverable: keep tooling docs and scripts in sync with `build`, `test`, `lint`, and private-server deployment behavior.
  Unblocks: predictable headless agent execution and operator onboarding.

- qa-reviewer: define a lightweight review checklist for changes that touch `Memory`, spawn heuristics, or remote mining.
  Deliverable: add the checklist to shared workflow documentation.
  Unblocks: better regression control for agent-driven changes.

- documentation-owner: keep onboarding and workflow docs aligned with how this Screeps repo actually works rather than the upstream starter defaults.
  Deliverable: shared docs updates when process or architecture shifts.
  Unblocks: faster recovery for future sessions after global resets.

## Blocked by Others

- none

## Already Decided

- Multi-agent orchestration should favor small, ownership-aligned changes over broad parallel edits in shared hot paths.
- Parallel runs should default to `--no-auto-commit`.

## Reach goals

- technical-architect: propose a lightweight change taxonomy for this repo such as safe-local, cross-tick-risky, and migration-required.
  Stretch value: makes it easier to route work automatically and reject unsafe parallel batches.

- economy-engineer: identify one CPU-conscious improvement to remote-mining scheduling or hauling throughput that looks promising but still needs validation before implementation.
  Stretch value: seeds a higher-upside optimization queue without forcing a risky immediate code change.

- operations-engineer: sketch a small extension to `scripts/agent_manager.py` that can warn when selected roles are likely to edit overlapping hot-path files.
  Stretch value: improves operator safety before adding more aggressive parallel runs.

- qa-reviewer: define a compact post-change validation loop for gameplay edits that is realistic even with the current test and lint baseline.
  Stretch value: gives future agent runs a repeatable minimum bar beyond `npm run build`.

- documentation-owner: produce a concise runbook section for resuming work after a global reset or partial agent session.
  Stretch value: reduces coordination loss between longer-running orchestration sessions.
