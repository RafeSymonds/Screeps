import { World } from "world/World";
import { Plan } from "./Plan";
import { needsScouting } from "rooms/RoomScouting";
import { roomsWithin } from "rooms/RoomUtils";

export class ObserverPlan extends Plan {
    public override run(world: World): void {
        for (const [, worldRoom] of world.rooms) {
            const room = worldRoom.room;

            if (!room.controller?.my || room.controller.level < 7) {
                continue;
            }

            const observers = room
                .find(FIND_MY_STRUCTURES)
                .filter((s): s is StructureObserver => s.structureType === STRUCTURE_OBSERVER);

            if (observers.length === 0) {
                continue;
            }

            const observer = observers[0];

            const candidates = this.findScryTargets(room.name);
            if (candidates.length > 0) {
                observer.observeRoom(candidates[0]);
            }
        }
    }

    private findScryTargets(homeRoom: string): string[] {
        const candidates: string[] = [];
        const checked = new Set<string>();

        const checkRoom = (roomName: string, priority: number) => {
            if (checked.has(roomName) || candidates.length >= 3) return;
            checked.add(roomName);

            if (!needsScouting(roomName)) return;

            const intel = Memory.rooms[roomName]?.intel;
            const distance = Game.map.getRoomLinearDistance(homeRoom, roomName);

            let score = priority;
            if (!intel) score *= 5;
            if ((intel?.sourceCount ?? 0) >= 2) score *= 3;
            if (distance <= 2) score *= 2;

            candidates.push(roomName);
        };

        checkRoom(homeRoom, 10);

        const remotes = Object.entries(Memory.rooms)
            .filter(([name, data]) => data.remoteStrategy?.ownerRoom === homeRoom)
            .map(([name]) => name);
        for (const remote of remotes) {
            checkRoom(remote, 8);
        }

        const radius = 3;
        const nearbyRooms = roomsWithin(homeRoom, radius);
        for (const roomName of nearbyRooms) {
            const strategy = Memory.rooms[roomName]?.remoteStrategy;
            if (strategy?.state === "candidate") {
                checkRoom(roomName, 6);
            }
        }

        for (const roomName of nearbyRooms) {
            if (roomName === homeRoom) continue;
            const intel = Memory.rooms[roomName]?.intel;
            if (intel && intel.sourceCount >= 2 && !intel.hasEnemyBase) {
                checkRoom(roomName, 5);
            }
        }

        return candidates;
    }
}
