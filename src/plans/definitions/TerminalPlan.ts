import { Plan } from "./Plan";
import { World } from "world/World";
import { ownedRooms } from "rooms/RoomUtils";

const ENERGY_BALANCE_THRESHOLD = 50000;
const ENERGY_SEND_AMOUNT = 10000;
const TERMINAL_COOLDOWN_BUFFER = 5;
const MINERAL_SELL_THRESHOLD = 5000;
const MINERAL_PRICE_FLOOR = 0.1;

interface RoomEconomyState {
    room: Room;
    storageEnergy: number;
    terminalEnergy: number;
    rcl: number;
    surplus: boolean;
    deficit: boolean;
    isYoung: boolean;
    sendPriority: number;
}

function calculateRoomEconomyState(room: Room): RoomEconomyState {
    const storageEnergy = room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    const terminalEnergy = room.terminal?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
    const rcl = room.controller?.level ?? 1;
    const onboarding = room.memory.onboarding;
    const isYoung = onboarding?.stage !== "established";
    const surplus = storageEnergy > ENERGY_BALANCE_THRESHOLD * 2 && terminalEnergy > ENERGY_SEND_AMOUNT;
    const deficit =
        storageEnergy < ENERGY_BALANCE_THRESHOLD / 2 || (isYoung && storageEnergy < ENERGY_BALANCE_THRESHOLD);

    const spawnActivity = room.find(FIND_MY_SPAWNS).length > 0;
    const constructionSites = room.find(FIND_CONSTRUCTION_SITES).length;
    const spawnPressure = room.memory.spawnStats?.mine.pressure ?? 0;

    let sendPriority = 0;
    if (surplus) {
        sendPriority = storageEnergy / 10000;
        if (rcl >= 7) sendPriority += 2;
        if (spawnPressure < 0.3) sendPriority += 1;
    }

    return { room, storageEnergy, terminalEnergy, rcl, surplus, deficit, isYoung, sendPriority };
}

/**
 * Manages terminal-based economy:
 * 1. Balance energy between owned rooms via terminal transfers
 * 2. Sell excess minerals on the market
 */
export class TerminalPlan extends Plan {
    public override run(world: World): void {
        const rooms = ownedRooms();

        this.balanceEnergy(rooms);
        this.sellExcessMinerals(rooms);
    }

    private balanceEnergy(rooms: Room[]): void {
        const states = rooms
            .filter(r => r.terminal && r.terminal.cooldown <= TERMINAL_COOLDOWN_BUFFER)
            .map(calculateRoomEconomyState);

        const surplus = states.filter(s => s.surplus).sort((a, b) => b.sendPriority - a.sendPriority);

        const deficit = states
            .filter(s => s.deficit)
            .sort((a, b) => {
                if (a.isYoung && !b.isYoung) return -1;
                if (!a.isYoung && b.isYoung) return 1;
                return a.storageEnergy - b.storageEnergy;
            });

        for (const sender of surplus) {
            if (!sender.room.terminal || sender.room.terminal.cooldown > 0) {
                continue;
            }

            for (const receiver of deficit) {
                if (!receiver.room.terminal) {
                    continue;
                }

                const cost = Game.market.calcTransactionCost(ENERGY_SEND_AMOUNT, sender.room.name, receiver.room.name);
                const available = sender.room.terminal.store.getUsedCapacity(RESOURCE_ENERGY);

                if (available >= ENERGY_SEND_AMOUNT + cost) {
                    sender.room.terminal.send(RESOURCE_ENERGY, ENERGY_SEND_AMOUNT, receiver.room.name);
                    break;
                }
            }
        }
    }

    private sellExcessMinerals(rooms: Room[]): void {
        for (const room of rooms) {
            if (!room.terminal || room.terminal.cooldown > 0) {
                continue;
            }

            const storageEnergy = room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
            const rcl = room.controller?.level ?? 1;

            for (const resourceType of Object.keys(room.terminal.store) as ResourceConstant[]) {
                if (resourceType === RESOURCE_ENERGY) {
                    continue;
                }

                const amount = room.terminal.store.getUsedCapacity(resourceType);

                if (amount < MINERAL_SELL_THRESHOLD) {
                    continue;
                }

                const orders = Game.market.getAllOrders({
                    type: ORDER_BUY,
                    resourceType
                });

                if (orders.length === 0) {
                    continue;
                }

                const bestOrder = orders.sort((a, b) => b.price - a.price)[0];

                if (bestOrder.price < MINERAL_PRICE_FLOOR) {
                    continue;
                }

                const minReserve = rcl >= 7 ? 5000 : 2000;
                const sellAmount = Math.min(amount - minReserve, bestOrder.remainingAmount, 1000);

                if (sellAmount > 0) {
                    Game.market.deal(bestOrder.id, sellAmount, room.name);
                    break;
                }
            }
        }
    }
}
