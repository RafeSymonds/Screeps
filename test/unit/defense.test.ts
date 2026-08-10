import { expect } from "../helpers/chai";
import { AssignmentKind } from "shared/assignments";
import { HostileView, Pos, RoomSnapshot, StructureView } from "shared/views";
import { DEFENSE_CONFIG } from "defense/config";
import { computeFortifyTargets } from "defense/fortify";
import { defenderBody, planDefense } from "defense/response";
import { planTowerFire, towerDamage } from "defense/towers";
import { assessThreat, ThreatLevel } from "defense/threat";

function pos(x: number, y: number): Pos {
    return { x, y, roomName: "W1N1" };
}

function hostile(id: string, p: Pos, bodyCounts: Partial<Record<BodyPartConstant, number>>, owner = "Raiders", hits = 1000): HostileView {
    return { id: id as Id<Creep>, pos: p, owner, hits, bodyCounts };
}

function tower(id: string, p: Pos, energy = 1000): StructureView {
    return {
        id: id as Id<AnyStructure>,
        type: STRUCTURE_TOWER,
        pos: p,
        hits: 3000,
        hitsMax: 3000,
        store: { free: 1000 - energy, used: energy, byResource: energy > 0 ? { energy } : {} }
    };
}

function rampart(id: string, p: Pos, hits: number): StructureView {
    return { id: id as Id<AnyStructure>, type: STRUCTURE_RAMPART, pos: p, hits, hitsMax: 300_000_000 };
}

function room(overrides: Partial<RoomSnapshot> = {}): RoomSnapshot {
    return {
        name: "W1N1",
        my: true,
        controller: {
            id: "ctrl" as Id<StructureController>,
            pos: pos(25, 15),
            level: 4,
            my: true,
            progress: 0,
            progressTotal: 405000,
            ticksToDowngrade: 20000,
            safeModeAvailable: 1
        },
        energyAvailable: 1300,
        energyCapacityAvailable: 1300,
        sources: [],
        structures: {
            [STRUCTURE_SPAWN]: [
                {
                    id: "spawn1" as Id<AnyStructure>,
                    type: STRUCTURE_SPAWN,
                    pos: pos(25, 25),
                    hits: 5000,
                    hitsMax: 5000,
                    spawning: false
                }
            ]
        },
        myConstructionSites: [],
        hostiles: [],
        dropped: [],
        ...overrides
    };
}

const diplomacy = { allies: ["Friend"] };
const assess = (r: RoomSnapshot): ReturnType<typeof assessThreat> => assessThreat(r, diplomacy, DEFENSE_CONFIG.siegeFactor);

describe("threat assessment", () => {
    it("classifies none / nuisance / raid, counting CLAIM as armed", () => {
        expect(assess(room()).level).to.equal(ThreatLevel.None);
        const scout = room({ hostiles: [hostile("s1", pos(10, 10), { [MOVE]: 1 })] });
        expect(assess(scout).level).to.equal(ThreatLevel.Nuisance);
        const raider = room({ hostiles: [hostile("r1", pos(10, 10), { [ATTACK]: 2, [MOVE]: 2 })] });
        expect(assess(raider).level).to.equal(ThreatLevel.Raid);
        const claimer = room({ hostiles: [hostile("c1", pos(10, 10), { [CLAIM]: 1, [MOVE]: 1 })] });
        expect(assess(claimer).level).to.equal(ThreatLevel.Raid);
    });

    it("scales the siege bar with the room's own towers", () => {
        const wave = [hostile("w1", pos(10, 10), { [ATTACK]: 24, [MOVE]: 24 })];
        // 24 armed parts: siege for a towerless room (bar 15), raid with 3 towers (bar 60).
        expect(assess(room({ hostiles: wave })).level).to.equal(ThreatLevel.Siege);
        const towered = room({
            hostiles: wave,
            structures: { ...room().structures, [STRUCTURE_TOWER]: [tower("t1", pos(24, 24)), tower("t2", pos(26, 24)), tower("t3", pos(25, 23))] }
        });
        expect(assess(towered).level).to.equal(ThreatLevel.Raid);
    });

    it("excludes allies entirely", () => {
        const friendly = room({ hostiles: [hostile("f1", pos(10, 10), { [ATTACK]: 10 }, "Friend")] });
        const a = assess(friendly);
        expect(a.level).to.equal(ThreatLevel.None);
        expect(a.hostiles).to.have.length(0);
    });
});

describe("tower fire", () => {
    it("computes the engine's falloff exactly", () => {
        expect(towerDamage(1)).to.equal(600);
        expect(towerDamage(5)).to.equal(600);
        expect(towerDamage(12)).to.equal(390);
        expect(towerDamage(20)).to.equal(150);
        expect(towerDamage(30)).to.equal(150);
    });

    it("focuses all towers on the argmax-damage target, skipping rampart squatters", () => {
        const near = hostile("near", pos(24, 22), { [ATTACK]: 2 });
        const far = hostile("far", pos(5, 5), { [ATTACK]: 2 });
        const squatter = hostile("squat", pos(25, 24), { [ATTACK]: 2 });
        const r = room({
            hostiles: [far, near, squatter],
            structures: {
                ...room().structures,
                [STRUCTURE_TOWER]: [tower("t1", pos(24, 24)), tower("t2", pos(26, 24))],
                [STRUCTURE_RAMPART]: [rampart("ram1", pos(25, 24), 10000)]
            }
        });
        const shots = planTowerFire(r, assess(r));
        expect(shots).to.have.length(2);
        expect(shots.every(s => s.targetId === "near")).to.equal(true);
    });

    it("never fires at nuisance and never with dry towers", () => {
        const scoutRoom = room({
            hostiles: [hostile("s1", pos(20, 20), { [MOVE]: 1 })],
            structures: { ...room().structures, [STRUCTURE_TOWER]: [tower("t1", pos(24, 24))] }
        });
        expect(planTowerFire(scoutRoom, assess(scoutRoom))).to.have.length(0);
        const dry = room({
            hostiles: [hostile("r1", pos(20, 20), { [ATTACK]: 2 })],
            structures: { ...room().structures, [STRUCTURE_TOWER]: [tower("t1", pos(24, 24), 5)] }
        });
        expect(planTowerFire(dry, assess(dry))).to.have.length(0);
    });
});

describe("defense response", () => {
    const raidRoom = (towers: StructureView[]): RoomSnapshot =>
        room({
            hostiles: [hostile("r1", pos(20, 20), { [ATTACK]: 4, [MOVE]: 4 })],
            structures: { ...room().structures, [STRUCTURE_TOWER]: towers }
        });

    it("demands defenders only when towers cannot fight", () => {
        const healthy = planDefense(raidRoom([tower("t1", pos(24, 24))]), assess(raidRoom([tower("t1", pos(24, 24))])), [], DEFENSE_CONFIG);
        expect(healthy.demands).to.have.length(0);
        const dry = raidRoom([tower("t1", pos(24, 24), 5)]);
        const plan = planDefense(dry, assess(dry), [], DEFENSE_CONFIG);
        expect(plan.demands).to.have.length(1);
        expect(plan.demands[0].priority).to.equal(0);
        expect(plan.demands[0].minBody).to.deep.equal([MOVE, ATTACK]);
        expect(plan.demands[0].assignment.kind).to.equal(AssignmentKind.Defend);
        const towerless = raidRoom([]);
        expect(planDefense(towerless, assess(towerless), [], DEFENSE_CONFIG).demands).to.have.length(1);
    });

    it("scales the crew at siege and counts staffed defenders", () => {
        const siege = room({ hostiles: [hostile("w1", pos(20, 20), { [ATTACK]: 24, [MOVE]: 24 })] });
        const plan = planDefense(siege, assess(siege), [], DEFENSE_CONFIG);
        expect(plan.demands).to.have.length(DEFENSE_CONFIG.siegeDefenders);
        const defender = {
            name: "d1",
            id: "d1" as Id<Creep>,
            pos: pos(25, 24),
            hits: 100,
            hitsMax: 100,
            ticksToLive: 1000,
            spawning: false,
            bodyCounts: { [ATTACK]: 1, [MOVE]: 1 },
            store: { free: 0, used: 0, byResource: {} },
            memory: { home: "W1N1", assignment: { kind: AssignmentKind.Defend, room: "W1N1" } } as CreepMemory
        };
        expect(planDefense(siege, assess(siege), [defender], DEFENSE_CONFIG).demands).to.have.length(
            DEFENSE_CONFIG.siegeDefenders - 1
        );
    });

    it("sizes the body MOVE-first with a spawn-time cap", () => {
        expect(defenderBody(300, DEFENSE_CONFIG)).to.deep.equal([MOVE, MOVE, ATTACK, ATTACK]);
        expect(defenderBody(1300, DEFENSE_CONFIG).filter(p => p === ATTACK)).to.have.length(10);
        expect(defenderBody(5600, DEFENSE_CONFIG)).to.have.length(2 * DEFENSE_CONFIG.maxDefenderPairs);
        expect(defenderBody(5600, DEFENSE_CONFIG)[0]).to.equal(MOVE);
    });

    it("requests safe mode only on damage evidence with a willing controller", () => {
        const hurtSpawn = (extra: Partial<RoomSnapshot["controller"] & object> = {}): RoomSnapshot => {
            const r = room({ hostiles: [hostile("r1", pos(24, 24), { [ATTACK]: 4 })] });
            r.structures[STRUCTURE_SPAWN]![0].hits = 2000; // 40% of 5000
            Object.assign(r.controller!, extra);
            return r;
        };
        expect(planDefense(hurtSpawn(), assess(hurtSpawn()), [], DEFENSE_CONFIG).requestSafeMode).to.equal(true);
        // Healthy spawn → no request even at raid.
        const healthy = room({ hostiles: [hostile("r1", pos(24, 24), { [ATTACK]: 4 })] });
        expect(planDefense(healthy, assess(healthy), [], DEFENSE_CONFIG).requestSafeMode).to.equal(false);
        // Cooldown / active / blocked / unavailable all suppress.
        expect(planDefense(hurtSpawn({ safeModeCooldown: 100 }), assess(hurtSpawn()), [], DEFENSE_CONFIG).requestSafeMode).to.equal(false);
        expect(planDefense(hurtSpawn({ safeMode: 5000 }), assess(hurtSpawn()), [], DEFENSE_CONFIG).requestSafeMode).to.equal(false);
        expect(planDefense(hurtSpawn({ upgradeBlocked: 200 }), assess(hurtSpawn()), [], DEFENSE_CONFIG).requestSafeMode).to.equal(false);
        expect(planDefense(hurtSpawn({ safeModeAvailable: 0 }), assess(hurtSpawn()), [], DEFENSE_CONFIG).requestSafeMode).to.equal(false);
    });
});

describe("fortification targets", () => {
    it("scales with RCL, triples under recent threat, bounded and ascending", () => {
        const walls = [rampart("a", pos(1, 1), 5000), rampart("b", pos(2, 2), 500), rampart("c", pos(3, 3), 40000)];
        const r = room({ structures: { ...room().structures, [STRUCTURE_RAMPART]: walls } });
        // RCL4 target 50k: all three below → ascending by hits.
        const targets = computeFortifyTargets(r, 4, false, DEFENSE_CONFIG);
        expect(targets.map(t => t.id)).to.deep.equal(["b", "a", "c"]);
        expect(targets[0].targetHits).to.equal(50000);
        // RCL3 target 10k: c (60k) is above target.
        expect(computeFortifyTargets(r, 3, false, DEFENSE_CONFIG).map(t => t.id)).to.deep.equal(["b", "a"]);
        // Recent threat triples: RCL3 → 30k, c still above.
        expect(computeFortifyTargets(r, 3, true, DEFENSE_CONFIG)[0].targetHits).to.equal(30000);
        // Bounded to maxFortifyTargets.
        const many = [...Array(10).keys()].map(i => rampart(`m${i}`, pos(i, i), i * 100));
        const bounded = computeFortifyTargets(
            room({ structures: { ...room().structures, [STRUCTURE_RAMPART]: many } }),
            4,
            false,
            DEFENSE_CONFIG
        );
        expect(bounded).to.have.length(DEFENSE_CONFIG.maxFortifyTargets);
    });
});
