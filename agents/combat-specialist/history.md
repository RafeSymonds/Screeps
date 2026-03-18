# History

- 2026-03-18: Role initialized.
- 2026-03-18: Improved combat planning and intelligence.
    - Modified `DefensePlan.ts` to protect active remote mining rooms, requesting defenders from the owner room.
    - Enhanced `AttackPlan.ts` to proactively clear nearby `invaderCore` structures blocking remotes, reducing energy surplus requirements for these critical targets.
    - Updated `intelStatus` in `RoomIntel.ts` to include rooms with hostile military parts as `DANGEROUS`.
    - Improved `needsScouting` in `RoomScouting.ts` to check `DANGEROUS` rooms every 100 ticks.
    - Coordinated with `economy-engineer` regarding increased spawn pressure and remote mining safety.

