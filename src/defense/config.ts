/**
 * Defense tunables — one named config, all provisional. See docs/design/defense.md.
 */
import { ThreatLevel } from "defense/threat";

export interface DefenseConfig {
    /** Keep at least this much in a tower for fighting; repair only above it. */
    towerRepairReserve: number;
    /** Ticks between quiet-room tower repairs — a trickle, not a second economy. */
    towerRepairInterval: number;
    /** Siege bar: armedParts > siegeFactor × (1 + towers in the room). */
    siegeFactor: number;
    /** FLOOR on defenders at Siege; the count itself is sized to the damage
     *  present (defense/response.ts), not to the tier. */
    siegeDefenders: number;
    /** How much more ATTACK we want than the attackers have. Parity is not enough:
     *  defenders arrive one at a time into a fight already in progress, and a
     *  defender that trades evenly still dies. */
    defenderOvermatch: number;
    /** Hard cap, so a huge raid cannot consume the whole spawn queue — losing the
     *  room slowly beats losing it while building an army that arrives too late. */
    maxDefenders: number;
    /** [MOVE,ATTACK] pair cap — bounds spawn time to ≤ 60 ticks. */
    maxDefenderPairs: number;
    /** Request safe mode when a spawn drops below this fraction of max hits. */
    spawnHitsFloor: number;
    /** Fortify targets below this are emergencies (repair before building). */
    emergencyFloor: number;
    /** Rampart/wall target HP by RCL (defense.md table). */
    targetHits: Record<number, number>;
    /** Targets are tripled while lastHostile is within this many ticks. */
    threatMemory: number;
    /** Max fortify targets returned per call (ascending hits). */
    maxFortifyTargets: number;
}

export const DEFENSE_CONFIG: DefenseConfig = {
    towerRepairReserve: 500,
    towerRepairInterval: 10,
    siegeFactor: 15,
    siegeDefenders: 3,
    defenderOvermatch: 1.5,
    maxDefenders: 6,
    maxDefenderPairs: 10,
    spawnHitsFloor: 0.5,
    emergencyFloor: 3000,
    targetHits: { 1: 10_000, 2: 10_000, 3: 10_000, 4: 50_000, 5: 50_000, 6: 200_000, 7: 1_000_000, 8: 3_000_000 },
    threatMemory: 10_000,
    maxFortifyTargets: 5
};

export const PRIORITY_DEFENDER = 0;
export { ThreatLevel };
