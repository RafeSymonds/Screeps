/**
 * The response ladder's pure rungs 2 and 3: defender demands when towers can't
 * carry the fight, safe-mode request on damage evidence. See docs/design/defense.md.
 */
import { AssignmentKind } from "shared/assignments";
import { SpawnDemand } from "shared/spawning";
import { SubsystemId } from "shared/subsystems";
import { CreepView, RoomSnapshot } from "shared/views";
import { DefenseConfig, PRIORITY_DEFENDER } from "defense/config";
import { ThreatAssessment, ThreatLevel } from "defense/threat";

const SHOT_COST = 10;
const PAIR_COST = 130; // MOVE 50 + ATTACK 80

/** MOVE×n then ATTACK×n — parts die front-to-back, so the weapon dies last.
 *  Pair cap bounds spawn time to ≤ 60 ticks: a slow emergency response isn't one. */
export function defenderBody(capacity: number, config: DefenseConfig): BodyPartConstant[] {
    const pairs = Math.min(config.maxDefenderPairs, Math.max(1, Math.floor(capacity / PAIR_COST)));
    return [...new Array<BodyPartConstant>(pairs).fill(MOVE), ...new Array<BodyPartConstant>(pairs).fill(ATTACK)];
}

export const DEFENDER_MIN_BODY: BodyPartConstant[] = [MOVE, ATTACK];

export function planDefense(
    room: RoomSnapshot,
    assessment: ThreatAssessment,
    roster: CreepView[],
    config: DefenseConfig
): { demands: SpawnDemand[]; requestSafeMode: boolean } {
    const demands: SpawnDemand[] = [];
    const underThreat = assessment.level === ThreatLevel.Raid || assessment.level === ThreatLevel.Siege;

    if (underThreat) {
        // Rung 2: only when the room's towers cannot carry it.
        const towers = room.structures[STRUCTURE_TOWER] ?? [];
        const towersCanFight = towers.some(t => (t.store?.byResource[RESOURCE_ENERGY] ?? 0) >= SHOT_COST);
        if (!towersCanFight) {
            const desired = assessment.level === ThreatLevel.Siege ? config.siegeDefenders : 1;
            const staffed = roster.filter(
                c => (c.memory as { assignment?: { kind?: AssignmentKind } }).assignment?.kind === AssignmentKind.Defend
            ).length;
            for (let slot = staffed; slot < desired; slot++) {
                demands.push({
                    id: `defend:${room.name}:${slot}`,
                    priority: PRIORITY_DEFENDER,
                    home: room.name,
                    owner: SubsystemId.DefenseResponse,
                    assignment: { kind: AssignmentKind.Defend, room: room.name },
                    body: defenderBody(room.energyCapacityAvailable, config),
                    minBody: DEFENDER_MIN_BODY
                });
            }
        }
    }

    // Rung 3: damage evidence — a spawn below the hits floor — not tower state.
    const spawns = room.structures[STRUCTURE_SPAWN] ?? [];
    const spawnDying = spawns.some(s => s.hits < s.hitsMax * config.spawnHitsFloor);
    const controller = room.controller;
    const requestSafeMode =
        underThreat &&
        spawnDying &&
        controller !== undefined &&
        controller.safeModeAvailable > 0 &&
        (controller.safeMode ?? 0) === 0 &&
        (controller.safeModeCooldown ?? 0) === 0 &&
        (controller.upgradeBlocked ?? 0) === 0;

    return { demands, requestSafeMode };
}
