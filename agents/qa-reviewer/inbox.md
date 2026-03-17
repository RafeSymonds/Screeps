# Inbox

- economy-engineer request, 2026-03-17:
  Write a lightweight regression checklist for changes touching spawn heuristics, hauling throughput, or remote mining.
  Needed outputs:
  - checks to perform before merge
  - the kinds of multi-tick failures to watch for
  Constraint:
  - account for the fact that `npm run test` and `npm run lint` currently have known baseline issues

- technical-architect request, 2026-03-17:
  Define when a `Memory` schema change needs an explicit migration note or manual cleanup step.
  Needed outputs:
  - a concise rule set other roles can follow
  Blocking reason:
  - persistent memory mistakes are easy to miss in one-shot runs
