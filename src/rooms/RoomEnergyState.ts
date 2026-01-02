// world/RoomEnergyState.ts
import { WorldRoom } from "world/WorldRoom";

export type EnergyTarget = StructureContainer | StructureStorage | Tombstone | Ruin | Resource;

export type EnergySource = {
    target: EnergyTarget;
    amount: number;
};

export class RoomEnergyState {
    readonly room: Room;

    private sources: EnergySource[] = [];
    private reserved = new Map<Id<EnergyTarget>, number>();

    private sourceContainers = new Set<Id<StructureContainer>>();
    private needyContainers = new Set<Id<StructureContainer>>();

    constructor(worldRoom: WorldRoom) {
        this.room = worldRoom.room;
        this.analyzeContainers();
        this.scanSources();
    }

    /* ------------------ Analysis ------------------ */

    private analyzeContainers() {
        for (const s of this.room.find(FIND_STRUCTURES)) {
            if (!(s instanceof StructureContainer)) continue;

            const tied =
                s.pos.findInRange(FIND_SOURCES, 1).length > 0 || s.pos.findInRange(FIND_MINERALS, 1).length > 0;

            if (tied) this.sourceContainers.add(s.id);
            else this.needyContainers.add(s.id);
        }
    }

    private scanSources() {
        this.sources = [];

        for (const r of this.room.find(FIND_DROPPED_RESOURCES)) {
            if (r.resourceType === RESOURCE_ENERGY && r.amount > 0) {
                this.sources.push({ target: r, amount: r.amount });
            }
        }

        for (const s of this.room.find(FIND_STRUCTURES)) {
            if (s instanceof StructureContainer || s instanceof StructureStorage) {
                const amt = s.store.getUsedCapacity(RESOURCE_ENERGY);
                if (amt > 0) this.sources.push({ target: s, amount: amt });
            }
        }

        for (const t of this.room.find(FIND_TOMBSTONES)) {
            const amt = t.store.getUsedCapacity(RESOURCE_ENERGY);
            if (amt > 0) this.sources.push({ target: t, amount: amt });
        }

        for (const r of this.room.find(FIND_RUINS)) {
            const amt = r.store.getUsedCapacity(RESOURCE_ENERGY);
            if (amt > 0) this.sources.push({ target: r, amount: amt });
        }
    }

    /* ------------------ Reservations ------------------ */

    reserve(id: Id<EnergyTarget>, amount: number) {
        this.reserved.set(id, (this.reserved.get(id) ?? 0) + amount);
    }

    getReserved(id: Id<EnergyTarget>): number {
        return this.reserved.get(id) ?? 0;
    }

    /* ------------------ Queries ------------------ */

    getAvailableEnergy(): number {
        let total = 0;
        for (const { target, amount } of this.sources) {
            total += Math.max(0, amount - this.getReserved(target.id));
        }
        return total;
    }

    isValidSourceFor(from: EnergyTarget, to: Structure | RoomPosition | null): boolean {
        if (to === null) return true;

        if (from instanceof StructureStorage) return true;
        if (!(from instanceof StructureContainer)) return true;

        if (this.needyContainers.has(from.id)) return false;

        if (to instanceof StructureContainer && this.needyContainers.has(to.id) && this.needyContainers.has(from.id)) {
            return false;
        }

        if (to instanceof RoomPosition && from.pos.getRangeTo(to) < 2) {
            return false;
        }

        return true;
    }

    findBestSource(creep: Creep, destination: Structure | RoomPosition | null): EnergyTarget | null {
        let best: EnergyTarget | null = null;
        let bestScore = -Infinity;

        for (const { target, amount } of this.sources) {
            if (!this.isValidSourceFor(target, destination)) continue;

            const remaining = amount - this.getReserved(target.id);
            if (remaining <= 0) continue;

            const gain = Math.min(remaining, creep.store.getFreeCapacity(RESOURCE_ENERGY));
            const dist = creep.pos.getRangeTo(target.pos);

            const score = gain - dist * 2;
            if (score > bestScore) {
                bestScore = score;
                best = target;
            }
        }

        if (best) {
            this.reserve(best.id, creep.store.getFreeCapacity(RESOURCE_ENERGY));
        }

        return best;
    }
}
