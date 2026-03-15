import { assert } from "chai";
import { resetScreeps, createRoom } from "../helpers/screeps-fixture";

describe("TerminalPlan", () => {
    beforeEach(() => {
        resetScreeps();
        (global as any).Game.market = {
            calcTransactionCost: () => 500,
            getAllOrders: () => [],
            deal: () => OK
        };
    });

    it("sends energy from surplus rooms to deficit rooms", () => {
        const sends: any[] = [];

        const surplusTerminal = {
            cooldown: 0,
            store: {
                getUsedCapacity(type?: string) {
                    return type === "energy" ? 50000 : 0;
                }
            },
            send(resourceType: string, amount: number, dest: string) {
                sends.push({ resourceType, amount, dest });
                return OK;
            }
        };

        const deficitTerminal = {
            cooldown: 0,
            store: {
                getUsedCapacity(type?: string) {
                    return type === "energy" ? 1000 : 0;
                }
            },
            send() { return OK; }
        };

        const surplusRoom = createRoom({
            name: "W0N0",
            my: true,
            level: 6,
            energyCapacityAvailable: 1800,
            storageEnergy: 150000
        });
        (surplusRoom as any).terminal = surplusTerminal;

        const deficitRoom = createRoom({
            name: "W5N0",
            my: true,
            level: 6,
            energyCapacityAvailable: 1800,
            storageEnergy: 5000
        });
        (deficitRoom as any).terminal = deficitTerminal;

        const { TerminalPlan } = require("../../src/plans/defintions/TerminalPlan");
        const plan = new TerminalPlan();

        plan.run({
            rooms: new Map([
                ["W0N0", { room: surplusRoom }],
                ["W5N0", { room: deficitRoom }]
            ])
        });

        assert.isAtLeast(sends.length, 1, "should send energy");
        assert.equal(sends[0].resourceType, "energy");
        assert.equal(sends[0].dest, "W5N0");
    });

    it("sells excess minerals when buy orders exist", () => {
        const deals: any[] = [];

        (global as any).Game.market = {
            calcTransactionCost: () => 100,
            getAllOrders(filter: any) {
                if (filter.resourceType === "H") {
                    return [
                        { id: "order1", type: "buy", resourceType: "H", price: 0.5, remainingAmount: 5000 }
                    ];
                }
                return [];
            },
            deal(orderId: string, amount: number, roomName: string) {
                deals.push({ orderId, amount, roomName });
                return OK;
            }
        };

        const terminal = {
            cooldown: 0,
            store: {
                getUsedCapacity(type?: string) {
                    if (type === "energy") return 20000;
                    if (type === "H") return 8000;
                    return 0;
                },
                [Symbol.iterator]: function* () {
                    // Not used in this test path
                }
            },
            send() { return OK; }
        };

        // Mock Object.keys on store to return resource types
        Object.defineProperty(terminal.store, Symbol.iterator, { enumerable: false });
        const storeKeys = ["energy", "H"];
        const originalKeys = Object.keys;
        (Object as any).keys = function(obj: any) {
            if (obj === terminal.store) return storeKeys;
            return originalKeys(obj);
        };

        const room = createRoom({
            name: "W0N0",
            my: true,
            level: 6,
            energyCapacityAvailable: 1800,
            storageEnergy: 80000 // not surplus enough to send energy
        });
        (room as any).terminal = terminal;

        const { TerminalPlan } = require("../../src/plans/defintions/TerminalPlan");
        const plan = new TerminalPlan();
        plan.run({ rooms: new Map([["W0N0", { room }]]) });

        // Restore
        (Object as any).keys = originalKeys;

        assert.isAtLeast(deals.length, 1, "should sell excess minerals");
        assert.equal(deals[0].orderId, "order1");
        assert.equal(deals[0].roomName, "W0N0");
    });

    it("does nothing when terminal is on cooldown", () => {
        const sends: any[] = [];

        const terminal = {
            cooldown: 10,
            store: { getUsedCapacity: () => 50000 },
            send() { sends.push("sent"); return OK; }
        };

        const room = createRoom({
            name: "W0N0",
            my: true,
            level: 6,
            energyCapacityAvailable: 1800,
            storageEnergy: 200000
        });
        (room as any).terminal = terminal;

        const { TerminalPlan } = require("../../src/plans/defintions/TerminalPlan");
        const plan = new TerminalPlan();
        plan.run({ rooms: new Map([["W0N0", { room }]]) });

        assert.lengthOf(sends, 0, "should not send on cooldown");
    });
});
