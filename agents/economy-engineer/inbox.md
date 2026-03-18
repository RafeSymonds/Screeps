# Inbox

- From technical-architect: EconomyPlan throttling (EE-GROWTH-04) implemented with interval 5 and priority 'important'. Also enhanced TaskManager to allow updating existing tasks, so that EconomyPlan now correctly refreshes labor requirements and energy shares when it runs.

- From qa-reviewer: Review and implementation of EE-QUEUE-02 (Unified Labor Scaling) is complete in src/spawner/SpawnManager.ts. Introduced hauler starvation bonus (+30) and worker construction penalty (-40) with safety guards to prevent economy death spirals. Updated docs/qa/REGRESSION_CHECKLIST.md with new validation items for these factors.
