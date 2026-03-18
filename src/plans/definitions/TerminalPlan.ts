import { Plan } from "./Plan";
import { World } from "world/World";
import { ownedRooms } from "rooms/RoomUtils";

const ENERGY_BALANCE_THRESHOLD = 50000;
const ENERGY_SEND_AMOUNT = 10000;
const TERMINAL_COOLDOWN_BUFFER = 5;
const MINERAL_SELL_THRESHOLD = 5000;

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
        const surplus: Room[] = [];
        const deficit: Room[] = [];

        for (const room of rooms) {
            if (!room.terminal || room.terminal.cooldown > TERMINAL_COOLDOWN_BUFFER) {
                continue;
            }

            const storageEnergy = room.storage?.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
            const terminalEnergy = room.terminal.store.getUsedCapacity(RESOURCE_ENERGY) ?? 0;
            const onboarding = room.memory.onboarding;

            if (storageEnergy > ENERGY_BALANCE_THRESHOLD * 2 && terminalEnergy > ENERGY_SEND_AMOUNT) {
                surplus.push(room);
            } else if (storageEnergy < ENERGY_BALANCE_THRESHOLD / 2) {
                deficit.push(room);
            } else if (onboarding && onboarding.stage !== "established" && storageEnergy < ENERGY_BALANCE_THRESHOLD) {
                // Young rooms get priority deficit status
                deficit.unshift(room);
            }
        }

        // Send energy from surplus to deficit rooms
        for (const sender of surplus) {
            if (!sender.terminal || sender.terminal.cooldown > 0) {
                continue;
            }

            for (const receiver of deficit) {
                if (!receiver.terminal) {
                    continue;
                }

                const cost = Game.market.calcTransactionCost(ENERGY_SEND_AMOUNT, sender.name, receiver.name);
                const available = sender.terminal.store.getUsedCapacity(RESOURCE_ENERGY);

                if (available >= ENERGY_SEND_AMOUNT + cost) {
                    sender.terminal.send(RESOURCE_ENERGY, ENERGY_SEND_AMOUNT, receiver.name);
                    break; // One send per terminal per tick
                }
            }
        }
    }

    private sellExcessMinerals(rooms: Room[]): void {
        for (const room of rooms) {
            if (!room.terminal || room.terminal.cooldown > 0) {
                continue;
            }

            // Check all mineral types in terminal
            for (const resourceType of Object.keys(room.terminal.store) as ResourceConstant[]) {
                if (resourceType === RESOURCE_ENERGY) {
                    continue;
                }

                const amount = room.terminal.store.getUsedCapacity(resourceType);

                if (amount < MINERAL_SELL_THRESHOLD) {
                    continue;
                }

                // Find a buy order for this resource
                const orders = Game.market.getAllOrders({
                    type: ORDER_BUY,
                    resourceType
                });

                if (orders.length === 0) {
                    continue;
                }

                // Pick the best-priced order
                const bestOrder = orders.sort((a, b) => b.price - a.price)[0];

                if (bestOrder.price <= 0) {
                    continue;
                }

                const sellAmount = Math.min(amount - 1000, bestOrder.remainingAmount, 1000);

                if (sellAmount > 0) {
                    Game.market.deal(bestOrder.id, sellAmount, room.name);
                    break; // One deal per terminal per tick
                }
            }
        }
    }
}
