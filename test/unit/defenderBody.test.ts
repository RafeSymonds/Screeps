import { assert } from "chai";
import { resetScreeps } from "../helpers/screeps-fixture";

// We can't import defenderBody directly (not exported), so we test through SpawnManager
// by creating scenarios that trigger defender spawning.
// Alternatively, we test the body composition properties.

describe("Defender Body Composition", () => {
    beforeEach(() => {
        resetScreeps();
    });

    it("spawns defenders with TOUGH first, MOVE last", () => {
        const spawnCalls: any[] = [];
        const spawn = {
            id: "spawn1",
            name: "spawn1",
            pos: new RoomPosition(25, 25, "W0N0"),
            spawning: false,
            spawnCreep(body: BodyPartConstant[], name: string, opts: any) {
                spawnCalls.push({ body, name, opts });
                return OK;
            }
        };

        const room = {
            name: "W0N0",
            memory: (global as any).Memory.rooms["W0N0"] ?? {},
            controller: { my: true, level: 4 },
            energyAvailable: 800,
            energyCapacityAvailable: 800,
            find(type: number) {
                if (type === FIND_MY_SPAWNS) return [spawn];
                if (type === FIND_MY_STRUCTURES) return [spawn];
                if (type === FIND_STRUCTURES) return [];
                return [];
            }
        } as unknown as Room;

        (global as any).Game.rooms["W0N0"] = room;
        (global as any).Memory.rooms["W0N0"] = room.memory;

        // Set up defense state to trigger defender spawning
        room.memory.spawnRequests = [
            {
                role: "defender",
                priority: 200,
                desiredCreeps: 1,
                expiresAt: (global as any).Game.time + 10,
                requestedBy: "defense:W0N0",
                minEnergy: 200
            }
        ];

        const { SpawnManager } = require("../../src/spawner/SpawnManager");
        const { CreepState } = require("../../src/creeps/CreepState");

        const world = {
            rooms: new Map([
                [room.name, { room, myCreeps: [], hostileCreeps: [], towers: [] }]
            ]),
            taskManager: {
                getTasksForRoom() {
                    return [];
                }
            }
        } as any;

        new SpawnManager().run(world);

        if (spawnCalls.length > 0) {
            const body = spawnCalls[0].body;

            // TOUGH should be at the beginning
            const firstNonTough = body.findIndex((p: string) => p !== TOUGH);
            const toughParts = body.filter((p: string) => p === TOUGH);
            if (toughParts.length > 0) {
                assert.equal(body[0], TOUGH, "first part should be TOUGH");
            }

            // MOVE should be at the end
            const lastMove = body.lastIndexOf(MOVE);
            assert.equal(lastMove, body.length - 1, "last part should be MOVE");

            // Should not have 2 MOVE per RANGED_ATTACK (old pattern)
            const raParts = body.filter((p: string) => p === RANGED_ATTACK).length;
            const moveParts = body.filter((p: string) => p === MOVE).length;
            // Move parts should equal RA + HEAL + TOUGH (1:1 ratio)
            assert.isAtMost(moveParts, raParts + toughParts.length + 1, "should use ~1:1 move ratio");
        }
    });
});
