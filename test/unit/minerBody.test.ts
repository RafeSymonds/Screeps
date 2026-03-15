import { assert } from "chai";
import { SpawnManager } from "../../src/spawner/SpawnManager";
import { CreepState } from "../../src/creeps/CreepState";
import { createRoom, resetScreeps } from "../helpers/screeps-fixture";

describe("Miner Body - Link Mining", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("includes CARRY part when room has links at RCL 5+", () => {
        const spawnCalls: any[] = [];

        const link = {
            id: "link1",
            structureType: "link" as any,
            pos: new RoomPosition(10, 10, "W0N0")
        };

        const spawn = {
            id: "spawn1",
            name: "spawn1",
            pos: new RoomPosition(25, 25, "W0N0"),
            structureType: "spawn" as any,
            spawning: false,
            spawnCreep(body: BodyPartConstant[], name: string, opts: any) {
                spawnCalls.push({ body, name, opts });
                return OK;
            }
        };

        const room = createRoom({
            name: "W0N0",
            my: true,
            level: 5,
            energyCapacityAvailable: 550,
            energyAvailable: 550,
            spawns: [spawn],
            myStructures: [spawn, link]
        });

        const world = {
            rooms: new Map([
                [room.name, { room, myCreeps: [] as CreepState[] }]
            ]),
            taskManager: {
                getTasksForRoom() {
                    return [
                        { requirements() { return { mine: { parts: 5, creeps: 1 } }; } }
                    ];
                }
            }
        } as any;

        new SpawnManager().run(world);

        assert.isAtLeast(spawnCalls.length, 1, "should spawn a miner");

        const body = spawnCalls[0].body;
        const hasCarry = body.includes(CARRY);
        assert.isTrue(hasCarry, "miner should have CARRY for link transfers");

        // Should still have WORK parts
        const workCount = body.filter((p: string) => p === WORK).length;
        assert.isAtLeast(workCount, 1, "should have WORK parts");
    });

    it("does not include CARRY at RCL 3 without links", () => {
        const spawnCalls: any[] = [];

        const spawn = {
            id: "spawn1",
            name: "spawn1",
            pos: new RoomPosition(25, 25, "W0N0"),
            structureType: "spawn" as any,
            spawning: false,
            spawnCreep(body: BodyPartConstant[], name: string, opts: any) {
                spawnCalls.push({ body, name, opts });
                return OK;
            }
        };

        createRoom({
            name: "W0N0",
            my: true,
            level: 3,
            energyCapacityAvailable: 550,
            energyAvailable: 550,
            spawns: [spawn],
            myStructures: [spawn]
        });

        const world = {
            rooms: new Map([
                ["W0N0", { room: (global as any).Game.rooms["W0N0"], myCreeps: [] as CreepState[] }]
            ]),
            taskManager: {
                getTasksForRoom() {
                    return [
                        { requirements() { return { mine: { parts: 5, creeps: 1 } }; } }
                    ];
                }
            }
        } as any;

        new SpawnManager().run(world);

        assert.isAtLeast(spawnCalls.length, 1);
        const body = spawnCalls[0].body;
        assert.isFalse(body.includes(CARRY), "miner should NOT have CARRY without links");
    });
});
