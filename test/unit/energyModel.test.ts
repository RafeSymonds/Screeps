import { expect } from "../helpers/chai";
import { makeCreep, makePos } from "../helpers/mock";
import { pickDeficitRole, roomDemand, senseEconomy } from "economy/EnergyModel";
import { LaborKind, RoomDemand } from "economy/types";
import { SpawnRole } from "spawn/types";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";

interface FakeRoomOpts {
    name?: string;
    sources?: Array<{ pos: RoomPosition }>;
    storage?: { pos: RoomPosition } | undefined;
    spawns?: Array<{ pos: RoomPosition }>;
    storageLevel?: number;
    backlog?: number;
}

function fakeRoom(opts: FakeRoomOpts): WorldRoom {
    return {
        name: opts.name ?? "W1N1",
        sources: opts.sources ?? [],
        storage: opts.storage,
        spawns: opts.spawns ?? [{ pos: makePos(25, 25) }],
        storageEnergy: () => opts.storageLevel ?? 0,
        backlogEnergy: () => opts.backlog ?? 0
    } as unknown as WorldRoom;
}

function fakeWorld(creeps: Creep[]): World {
    return { creepsForRoom: () => creeps } as unknown as World;
}

function miner(work: number): Creep {
    const body: BodyPartConstant[] = Array.from({ length: work }, () => WORK);
    body.push(MOVE);
    return makeCreep({ body, memory: { spawnRole: SpawnRole.Miner } as CreepMemory });
}

/** A WORK+CARRY worker — capability-able to mine, but must never count as income. */
function worker(work: number, carry = 1): Creep {
    const body: BodyPartConstant[] = [
        ...Array.from({ length: work }, () => WORK),
        ...Array.from({ length: carry }, () => CARRY),
        MOVE
    ];
    return makeCreep({ body, memory: { spawnRole: SpawnRole.Worker } as CreepMemory });
}

function source(x: number, y: number): { pos: RoomPosition } {
    return { pos: makePos(x, y) };
}

function demand(over: Partial<RoomDemand>): RoomDemand {
    return {
        roomName: "W1N1",
        miner: { target: 0, supply: 0 },
        hauler: { target: 0, supply: 0 },
        consumer: { target: 0, supply: 0 },
        income: 0,
        backlog: 0,
        storageLevel: 0,
        storageTrend: 0,
        ...over
    };
}

describe("roomDemand — income", () => {
    it("targets 5 WORK per source", () => {
        const d = roomDemand(fakeRoom({ sources: [source(10, 25), source(40, 25)] }), fakeWorld([]));
        expect(d.miner.target).to.equal(10);
    });

    it("caps measured income at source regen (10 e/tick per source)", () => {
        // Two 5-WORK miners = 10 WORK = 20 e/tick harvest, exactly the 2-source ceiling.
        const d = roomDemand(fakeRoom({ sources: [source(10, 25), source(40, 25)] }), fakeWorld([miner(5), miner(5)]));
        expect(d.income).to.equal(20);
        // Over-mining (extra WORK) cannot exceed the ceiling.
        const d2 = roomDemand(fakeRoom({ sources: [source(10, 25)] }), fakeWorld([miner(5), miner(5)]));
        expect(d2.income).to.equal(10);
    });

    it("counts only WORK-only bodies as miner supply — a worker (WORK+CARRY) is never income", () => {
        const r = fakeRoom({ sources: [source(20, 25)] });
        // A 5-WORK worker could physically mine, but it must not register as income,
        // so the model keeps wanting a real miner ("workers never mine unless needed").
        const dw = roomDemand(r, fakeWorld([worker(5)]));
        expect(dw.miner.supply).to.equal(0);
        expect(dw.income).to.equal(0);
        expect(dw.consumer.supply).to.equal(5); // it counts as consumption instead
        // A dedicated WORK-only miner does register.
        const dm = roomDemand(r, fakeWorld([miner(5)]));
        expect(dm.miner.supply).to.equal(5);
        expect(dm.income).to.equal(10);
    });
});

describe("roomDemand — logistics", () => {
    it("scales hauler CARRY with source→sink distance", () => {
        const near = roomDemand(
            fakeRoom({ sources: [source(20, 25)], storage: { pos: makePos(25, 25) } }),
            fakeWorld([miner(5)])
        );
        const far = roomDemand(
            fakeRoom({ sources: [source(45, 25)], storage: { pos: makePos(25, 25) } }),
            fakeWorld([miner(5)])
        );
        expect(far.hauler.target).to.be.greaterThan(near.hauler.target);
    });

    it("adds a CARRY bump when undelivered energy backs up", () => {
        const calm = roomDemand(
            fakeRoom({ sources: [source(35, 25)], storage: { pos: makePos(25, 25) }, backlog: 0 }),
            fakeWorld([miner(5)])
        );
        const backed = roomDemand(
            fakeRoom({ sources: [source(35, 25)], storage: { pos: makePos(25, 25) }, backlog: 2000 }),
            fakeWorld([miner(5)])
        );
        expect(backed.hauler.target).to.equal(calm.hauler.target + 4);
    });
});

describe("roomDemand — consumption band", () => {
    const oneSource = (extra: Partial<FakeRoomOpts>) =>
        roomDemand(fakeRoom({ sources: [source(20, 25)], ...extra }), fakeWorld([miner(5)]));

    it("consumes all income pre-storage (nowhere to bank)", () => {
        // income 10, efficiency 0.6 → ceil(10 / 0.6) = 17
        expect(oneSource({ storage: undefined }).consumer.target).to.equal(17);
    });

    it("hoards (min floor) when storage is below the reserve floor", () => {
        expect(oneSource({ storage: { pos: makePos(25, 25) }, storageLevel: 5000 }).consumer.target).to.equal(1);
    });

    it("spends the full surplus when storage is above target and not draining", () => {
        expect(oneSource({ storage: { pos: makePos(25, 25) }, storageLevel: 40000 }).consumer.target).to.equal(17);
    });

    it("eases off to half surplus when storage is draining", () => {
        Memory.rooms.W1N1 = { economy: { storageEMA: 40000, storageTrendEMA: -5 } } as RoomMemory;
        // bandFactor 0.5 → surplus 5 → ceil(5 / 0.6) = 9
        expect(oneSource({ storage: { pos: makePos(25, 25) } }).consumer.target).to.equal(9);
    });
});

describe("pickDeficitRole", () => {
    it("funds income first while mining is badly understaffed", () => {
        expect(pickDeficitRole(demand({ miner: { target: 10, supply: 0 }, consumer: { target: 17, supply: 0 } }))).to.equal(
            LaborKind.Miner
        );
    });

    it("funds logistics before consumption once income is covered", () => {
        expect(
            pickDeficitRole(
                demand({
                    miner: { target: 10, supply: 10 },
                    hauler: { target: 6, supply: 0 },
                    consumer: { target: 17, supply: 0 }
                })
            )
        ).to.equal(LaborKind.Hauler);
    });

    it("funds the largest remaining deficit once upstream is satisfied", () => {
        expect(
            pickDeficitRole(
                demand({
                    miner: { target: 10, supply: 10 },
                    hauler: { target: 6, supply: 6 },
                    consumer: { target: 17, supply: 2 }
                })
            )
        ).to.equal(LaborKind.Consumer);
    });

    it("keeps funding miners while sources are unsaturated, even though the elastic consumer is more behind", () => {
        // The bug: a partly-staffed income stage (deficit 0.3) loses to the
        // consumer's income-derived, cap-bound, never-reachable deficit (0.8) when
        // ranked flat — so sources stall at ~2 WORK/source forever. Income is
        // inelastic infrastructure and must win here.
        expect(
            pickDeficitRole(
                demand({
                    miner: { target: 10, supply: 7 }, // 0.3 deficit — still under-saturated
                    hauler: { target: 6, supply: 6 }, // satisfied
                    consumer: { target: 30, supply: 6 } // 0.8 deficit — but elastic
                })
            )
        ).to.equal(LaborKind.Miner);
    });

    it("funds logistics over the elastic consumer when the room is under-hauled", () => {
        expect(
            pickDeficitRole(
                demand({
                    miner: { target: 10, supply: 10 }, // saturated
                    hauler: { target: 8, supply: 3 }, // 0.625 deficit — backlog building
                    consumer: { target: 30, supply: 6 } // 0.8 deficit — but elastic
                })
            )
        ).to.equal(LaborKind.Hauler);
    });

    it("lets a starved consumer rejoin so the controller can never downgrade", () => {
        // Zero upgrade presence is the one case the consumer outranks unfinished
        // income: a single upgrader is cheap insurance against a controller
        // downgrade, and once supply ≥ the floor the consumer drops back to last.
        expect(
            pickDeficitRole(
                demand({
                    miner: { target: 10, supply: 3 }, // 0.7 deficit
                    consumer: { target: 17, supply: 0 } // 1.0 deficit AND below the floor
                })
            )
        ).to.equal(LaborKind.Consumer);
    });

    it("returns null when every target is met", () => {
        expect(
            pickDeficitRole(
                demand({
                    miner: { target: 10, supply: 10 },
                    hauler: { target: 6, supply: 6 },
                    consumer: { target: 17, supply: 17 }
                })
            )
        ).to.equal(null);
    });
});

describe("senseEconomy", () => {
    function senseRoom(level: number): WorldRoom {
        return { name: "W1N1", storageEnergy: () => level } as unknown as WorldRoom;
    }

    it("smooths the storage level and tracks a rising trend", () => {
        const world = (room: WorldRoom): World => ({ myRooms: [room] } as unknown as World);
        (Game as { time: number }).time = 100;
        senseEconomy(world(senseRoom(10000)));
        const first = Memory.rooms.W1N1.economy!;
        expect(first.storageEMA).to.equal(10000);
        expect(first.lastLevel).to.equal(10000);

        (Game as { time: number }).time = 110;
        senseEconomy(world(senseRoom(11000)));
        const second = Memory.rooms.W1N1.economy!;
        expect(second.storageEMA).to.be.greaterThan(10000); // EMA pulled up toward 11000
        expect(second.storageTrendEMA).to.be.greaterThan(0); // storage rising
    });
});
