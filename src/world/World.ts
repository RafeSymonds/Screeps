import { WorldRoom } from "world/WorldRoom";

/**
 * Per-tick world model. Built fresh each tick from live Game state and read by
 * every subsystem. Holds no persistent state of its own.
 */
export class World {
    public readonly time: number;
    public readonly rooms: Map<string, WorldRoom>;
    public readonly myRooms: WorldRoom[];
    public readonly creeps: Creep[];

    public constructor() {
        this.time = Game.time;
        this.creeps = Object.values(Game.creeps);
        this.rooms = new Map();
        this.myRooms = [];
        for (const name in Game.rooms) {
            const worldRoom = new WorldRoom(Game.rooms[name]);
            this.rooms.set(name, worldRoom);
            if (worldRoom.isMine) {
                this.myRooms.push(worldRoom);
            }
        }
    }

    public getRoom(name: string): WorldRoom | undefined {
        return this.rooms.get(name);
    }

    /** Live creeps whose home is the given room (regardless of current location). */
    public creepsForRoom(roomName: string): Creep[] {
        return this.creeps.filter(creep => creep.memory.home === roomName);
    }
}
