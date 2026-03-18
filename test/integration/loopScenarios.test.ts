import { assert } from "chai";
import { loop } from "../../src/main";
import { createRoom, resetScreeps, setGameTime } from "../helpers/screeps-fixture";

describe("loop scenarios", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("cleans up memory for dead creeps across ticks", () => {
        const room = createRoom({ name: "W0N0", my: true, level: 2, energyCapacityAvailable: 300 });
        const liveCreep = {
            id: "live-id",
            name: "live",
            body: [{ type: MOVE }],
            memory: { ownerRoom: room.name, taskTicks: 0, working: false },
            store: {
                getUsedCapacity: () => 0,
                getFreeCapacity: () => 50,
                getCapacity: () => 50
            },
            pos: new RoomPosition(25, 25, room.name),
            room,
            spawning: false,
            move: () => OK,
            moveTo: () => OK
        } as unknown as Creep;

        (global as any).Game.creeps.live = liveCreep;
        (global as any).Memory.creeps = {
            live: liveCreep.memory,
            dead: { ownerRoom: room.name, taskTicks: 0, working: false }
        };

        loop();

        assert.exists((global as any).Memory.creeps.live);
        assert.notExists((global as any).Memory.creeps.dead);
    });

    it("runs real ticks, records plan cadence, and spawns from economy demand", () => {
        const spawnCalls: any[] = [];
        const sources: any[] = [];
        const spawn = {
            id: "spawn1",
            pos: new RoomPosition(25, 25, "W0N0"),
            spawning: false,
            spawnCreep(body: BodyPartConstant[], name: string, opts: any) {
                spawnCalls.push({ body, name, opts, tick: (global as any).Game.time });
                return OK;
            }
        };
        const room = createRoom({
            name: "W0N0",
            my: true,
            level: 3,
            energyAvailable: 300,
            energyCapacityAvailable: 300,
            spawns: [spawn],
            sources
        });

        sources.push({
            id: "source1",
            pos: new RoomPosition(10, 10, room.name),
            room
        });

        setGameTime(1);
        loop();
        const firstSupportRun = (global as any).Memory.planRuns.support;
        const firstGrowthRun = (global as any).Memory.planRuns.growth;

        setGameTime(2);
        loop();

        setGameTime(11);
        loop();

        assert.isAtLeast(spawnCalls.length, 1);
        assert.deepEqual(spawnCalls[0].body, [MOVE, CARRY, WORK]);
        assert.equal(firstSupportRun, 1);
        assert.equal(firstGrowthRun, 1);
        assert.equal((global as any).Memory.planRuns.support, 11);
        assert.equal((global as any).Memory.planRuns.growth, 1);
    });
});
