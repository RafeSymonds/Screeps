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
    /** Defenders demanded at Siege (Raid gets 1). */
    siegeDefenders: number;
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
    maxDefenderPairs: 10,
    spawnHitsFloor: 0.5,
    emergencyFloor: 3000,
    targetHits: { 1: 10_000, 2: 10_000, 3: 10_000, 4: 50_000, 5: 50_000, 6: 200_000, 7: 1_000_000, 8: 3_000_000 },
    threatMemory: 10_000,
    maxFortifyTargets: 5
};

export const PRIORITY_DEFENDER = 0;
export { ThreatLevel };
