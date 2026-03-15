import { RELATIVE_BUNKER } from "./BaseLimitInfo";

interface AnchorCandidate {
    x: number;
    y: number;
    score: number;
}

export interface BasePlanData {
    anchorX: number;
    anchorY: number;
    score: number;
}

export function selectAnchor(room: Room): BasePlanData {
    const cached = room.memory.basePlan;
    if (cached) return cached;

    const terrain = room.getTerrain();
    const sources = room.find(FIND_SOURCES);
    const controller = room.controller;
    const candidates: AnchorCandidate[] = [];

    // Scan every 2 tiles, respecting margins for the bunker footprint
    for (let x = 8; x <= 41; x += 2) {
        for (let y = 6; y <= 41; y += 2) {
            const fitScore = stampFitScore(terrain, x, y);
            if (fitScore < 0) continue;

            const sourceScore = sources.reduce((total, source) => {
                const dist = Math.max(Math.abs(source.pos.x - x), Math.abs(source.pos.y - y));
                return total - dist * 2;
            }, 0);

            const controllerScore = controller
                ? -Math.max(Math.abs(controller.pos.x - x), Math.abs(controller.pos.y - y)) * 1.5
                : 0;

            const edgeScore = Math.min(x, y, 49 - x, 49 - y) * 3;
            const towerScore = towerExitCoverage(room, x, y);

            candidates.push({
                x,
                y,
                score: fitScore + sourceScore + controllerScore + edgeScore + towerScore
            });
        }
    }

    if (candidates.length === 0) {
        // Fallback to first spawn position
        const spawn = room.find(FIND_MY_SPAWNS)[0];
        const result: BasePlanData = {
            anchorX: spawn?.pos.x ?? 25,
            anchorY: spawn?.pos.y ?? 25,
            score: 0
        };
        room.memory.basePlan = result;
        return result;
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    const result: BasePlanData = {
        anchorX: best.x,
        anchorY: best.y,
        score: best.score
    };

    room.memory.basePlan = result;
    return result;
}

function stampFitScore(terrain: RoomTerrain, anchorX: number, anchorY: number): number {
    let blocked = 0;
    let total = 0;

    const structures = RELATIVE_BUNKER.buildings;
    for (const key of Object.keys(structures) as (keyof typeof structures)[]) {
        if (key === "road" || key === "rampart") continue;

        for (const offset of structures[key]) {
            const x = anchorX + offset.x;
            const y = anchorY + offset.y;
            total++;

            if (x <= 1 || x >= 48 || y <= 1 || y >= 48) return -1;

            if (terrain.get(x, y) === TERRAIN_MASK_WALL) {
                blocked++;
            }
        }
    }

    if (blocked > 3) return -1;

    return (total - blocked) * 5;
}

function towerExitCoverage(room: Room, anchorX: number, anchorY: number): number {
    const towerOffsets = RELATIVE_BUNKER.buildings.tower;
    const towerPositions = towerOffsets.map(off => ({ x: anchorX + off.x, y: anchorY + off.y }));

    let covered = 0;
    const exits = room.find(FIND_EXIT);
    const sampleRate = Math.max(1, Math.floor(exits.length / 20));

    for (let i = 0; i < exits.length; i += sampleRate) {
        const exit = exits[i];
        for (const tower of towerPositions) {
            const dist = Math.max(Math.abs(tower.x - exit.x), Math.abs(tower.y - exit.y));
            if (dist <= 15) {
                covered++;
                break;
            }
        }
    }

    return covered * 8;
}
