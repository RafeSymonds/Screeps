/**
 * Pure spawn resolution: priority-sorted demands against free spawns and one
 * shared energy pool, with deliberate head-of-line blocking and the minBody
 * bootstrap fallback. See docs/design/spawn.md "Resolution policy".
 */
import { SpawnDemand } from "shared/spawning";
import { RoomSnapshot } from "shared/views";
import { bodyCost, MAX_BODY_PARTS } from "economy/bodies";

export interface SpawnDecision {
    spawnId: Id<StructureSpawn>;
    demand: SpawnDemand;
    body: BodyPartConstant[];
    name: string;
}

export function resolveSpawns(demands: SpawnDemand[], room: RoomSnapshot, time: number): SpawnDecision[] {
    const freeSpawns = (room.structures[STRUCTURE_SPAWN] ?? []).filter(s => s.spawning !== true);
    if (freeSpawns.length === 0 || demands.length === 0) {
        return [];
    }

    const sorted = [...demands].sort((a, b) => a.priority - b.priority); // stable: emission order breaks ties
    const decisions: SpawnDecision[] = [];
    let remainingEnergy = room.energyAvailable;
    let next = 0;
    const namesUsed = new Set<string>();

    for (const spawn of freeSpawns) {
        if (next >= sorted.length) {
            break;
        }
        const demand = sorted[next];

        // Malformed body blocks the line like an unaffordable one (defense in depth).
        if (demand.body.length > MAX_BODY_PARTS || bodyCost(demand.body) > room.energyCapacityAvailable) {
            break;
        }

        let body: BodyPartConstant[] | undefined;
        if (remainingEnergy >= bodyCost(demand.body)) {
            body = demand.body;
        } else if (demand.minBody && remainingEnergy >= bodyCost(demand.minBody)) {
            body = demand.minBody;
        }
        if (!body) {
            break; // head-of-line blocking: energy accumulates toward this demand
        }

        let name = `${demand.assignment.kind}_${demand.home}_${time}`;
        for (let n = 1; namesUsed.has(name); n++) {
            name = `${demand.assignment.kind}_${demand.home}_${time}_${n}`;
        }
        namesUsed.add(name);

        decisions.push({ spawnId: spawn.id as Id<StructureSpawn>, demand, body, name });
        remainingEnergy -= bodyCost(body);
        next++;
    }
    return decisions;
}
