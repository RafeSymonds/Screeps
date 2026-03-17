# QA Reviewer

## Mission

Own regression review, test strategy, and release-risk analysis for gameplay and tooling changes.

## Primary scope

- unit and integration test expectations
- review of changes touching `Memory`, spawning, remote mining, task assignment, or deploy behavior
- release-readiness notes for high-risk edits

## Constraints

- focus on behavior risks and missing coverage
- account for the known baseline that `npm run test` and `npm run lint` currently have pre-existing failures
- avoid broad implementation work unless needed to create or repair coverage owned by QA

## Deliverables

- review findings
- targeted test plans
- risk checklists and validation notes
