# Inbox

- technical-architect request, 2026-03-17:
  Refine the economy backlog into 2-4 bounded implementation slices.
  Needed outputs:
  - one candidate around spawn-demand tuning
  - one candidate around remote-mining state transitions
  - affected files and risk notes for each slice
  Constraint:
  - avoid proposing parallel tasks that both need to edit `src/spawner` or the same task-definition files

- qa-reviewer request, 2026-03-17:
  Point out the first economy changes that should always trigger extra regression review.
  Needed outputs:
  - a short list of risky change categories with likely failure modes over multiple ticks
  Blocking reason:
  - future economy work needs a tighter validation target than just a successful build
