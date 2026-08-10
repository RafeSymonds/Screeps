/**
 * Tower fire plan — every tower with a shot's worth of energy focuses ONE target
 * (kill confirms beat spread damage). Pure. See docs/design/defense.md.
 */
import { Pos, RoomSnapshot } from "shared/views";
import { ThreatAssessment, ThreatLevel } from "defense/threat";

const OPTIMAL = 5;
const FALLOFF_RANGE = 20;
const POWER = 600;
const MIN_POWER = 150;
const SHOT_COST = 10;

const cheb = (a: Pos, b: Pos): number => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));

/** Engine-verified: 600 flat to range 5, linear falloff to 150 at ≥ 20 (chebyshev). */
export function towerDamage(range: number): number {
    if (range <= OPTIMAL) {
        return POWER;
    }
    if (range >= FALLOFF_RANGE) {
        return MIN_POWER;
    }
    return Math.floor(POWER - (POWER - MIN_POWER) * ((range - OPTIMAL) / (FALLOFF_RANGE - OPTIMAL)));
}

export function planTowerFire(
    room: RoomSnapshot,
    assessment: ThreatAssessment
): { towerId: Id<StructureTower>; targetId: Id<Creep> }[] {
    // Nuisance scouts are not worth 10 energy a shot (or the escalation).
    if (assessment.level !== ThreatLevel.Raid && assessment.level !== ThreatLevel.Siege) {
        return [];
    }
    const towers = (room.structures[STRUCTURE_TOWER] ?? []).filter(
        t => (t.store?.byResource[RESOURCE_ENERGY] ?? 0) >= SHOT_COST
    );
    if (towers.length === 0) {
        return [];
    }
    // A hostile on a rampart tile is untargetable — the engine redirects the shot
    // into the rampart itself.
    const rampartTiles = new Set(
        (room.structures[STRUCTURE_RAMPART] ?? []).map(r => r.pos.y * 50 + r.pos.x)
    );
    const targets = assessment.hostiles.filter(h => !rampartTiles.has(h.pos.y * 50 + h.pos.x));
    let best: { id: Id<Creep>; damage: number; hits: number } | undefined;
    for (const h of targets) {
        const damage = towers.reduce((sum, t) => sum + towerDamage(cheb(t.pos, h.pos)), 0);
        if (
            !best ||
            damage > best.damage ||
            (damage === best.damage && (h.hits < best.hits || (h.hits === best.hits && h.id < best.id)))
        ) {
            best = { id: h.id, damage, hits: h.hits };
        }
    }
    if (!best) {
        return [];
    }
    const focus = best;
    return towers.map(t => ({ towerId: t.id as Id<StructureTower>, targetId: focus.id }));
}
