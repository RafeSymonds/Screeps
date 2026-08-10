/**
 * Threat assessment — pure classification of a room's hostiles by body
 * composition, filtered through the diplomacy whitelist. See docs/design/defense.md.
 */
import { DiplomacyConfig } from "shared/diplomacy";
import { HostileView, RoomSnapshot } from "shared/views";

export enum ThreatLevel {
    None = "none",
    Nuisance = "nuisance",
    Raid = "raid",
    Siege = "siege"
}

export interface ThreatAssessment {
    level: ThreatLevel;
    /** Non-ally hostiles only. */
    hostiles: HostileView[];
    /** Subset with ATTACK/RANGED_ATTACK/HEAL/WORK/CLAIM parts — CLAIM counts:
     *  a controller attacker blocks upgrading AND safe mode (engine rule). */
    armed: HostileView[];
    armedParts: number;
}

const ARMED_PARTS: BodyPartConstant[] = [ATTACK, RANGED_ATTACK, HEAL, WORK, CLAIM];

function isArmed(h: HostileView): boolean {
    return ARMED_PARTS.some(p => (h.bodyCounts[p] ?? 0) > 0);
}

export function assessThreat(room: RoomSnapshot, diplomacy: DiplomacyConfig, siegeFactor: number): ThreatAssessment {
    const hostiles = room.hostiles.filter(h => !diplomacy.allies.includes(h.owner));
    const armed = hostiles.filter(isArmed);
    const armedParts = armed.reduce(
        (sum, h) => sum + (h.bodyCounts[ATTACK] ?? 0) + (h.bodyCounts[RANGED_ATTACK] ?? 0) + (h.bodyCounts[HEAL] ?? 0),
        0
    );
    let level = ThreatLevel.None;
    if (hostiles.length > 0) {
        if (armed.length === 0) {
            level = ThreatLevel.Nuisance;
        } else {
            const towers = room.structures[STRUCTURE_TOWER]?.length ?? 0;
            level = armedParts > siegeFactor * (1 + towers) || armed.length >= 8 ? ThreatLevel.Siege : ThreatLevel.Raid;
        }
    }
    return { level, hostiles, armed, armedParts };
}
