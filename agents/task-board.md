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
