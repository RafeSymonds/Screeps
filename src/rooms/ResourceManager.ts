import { WorldRoom } from "world/WorldRoom";

export type EnergyTarget = StructureContainer | StructureStorage | Tombstone | Ruin | Resource;

type EnergySource = {
    target: EnergyTarget;
    amount: number;
};

export function containerIsSourceTied(container: StructureContainer): boolean {
    return (
        container.pos.findInRange(FIND_SOURCES, 1).length > 0 || container.pos.findInRange(FIND_MINERALS, 1).length > 0
    );
}

export class ResourceManager {
    private resourcesPerRoom = new Map<string, EnergySource[]>();
    private reserved = new Map<Id<EnergyTarget>, number>();

    private sourceContainers = new Set<Id<StructureContainer>>();
    private needyContainers = new Set<Id<StructureContainer>>();

    constructor(worldRooms: WorldRoom[]) {
        // Recompute reservations every tick from creep intent
        // Recompute containers as well
        for (const room of worldRooms) {
            this.analyzeContainers(room.room);

            for (const creepState of room.myCreeps) {
                const targetId = creepState.memory.energyTargetId;
                if (!targetId) continue;

                const reserveAmount = creepState.creep.store.getFreeCapacity(RESOURCE_ENERGY);
                if (reserveAmount <= 0) continue;

                this.reserve(targetId, reserveAmount);
            }
        }
    }

    private analyzeContainers(room: Room) {
        for (const structure of room.find(FIND_STRUCTURES)) {
            if (!(structure instanceof StructureContainer)) {
                continue;
            }

            // Source-tied container → never a destination
            const isSourceTied = containerIsSourceTied(structure);

            if (isSourceTied) {
                this.sourceContainers.add(structure.id);
            } else {
                this.needyContainers.add(structure.id);
            }
        }
    }

    private isValidSourceFor(from: EnergyTarget, to: Structure | null): boolean {
        // Storage is always allowed
        if (from instanceof StructureStorage) return true;

        // Resource piles, tombstones, ruins are always valid sources
        if (!(from instanceof StructureContainer)) return true;

        // Never pull from a container that itself needs energy
        if (this.needyContainers.has(from.id)) return false;

        // If destination is a container and BOTH need energy → disallow
        if (to instanceof StructureContainer && this.needyContainers.has(to.id) && this.needyContainers.has(from.id)) {
            return false;
        }

        return true;
    }

    private reserve(id: Id<EnergyTarget>, amount: number) {
        this.reserved.set(id, (this.reserved.get(id) ?? 0) + amount);
    }

    private getReserved(id: Id<EnergyTarget>): number {
        return this.reserved.get(id) ?? 0;
    }

    private scanRoom(room: Room): EnergySource[] {
        const sources: EnergySource[] = [];

        for (const r of room.find(FIND_DROPPED_RESOURCES)) {
            if (r.resourceType === RESOURCE_ENERGY && r.amount > 0) {
                sources.push({ target: r, amount: r.amount });
            }
        }

        for (const s of room.find(FIND_STRUCTURES)) {
            if (s instanceof StructureContainer || s instanceof StructureStorage) {
                const amt = s.store.getUsedCapacity(RESOURCE_ENERGY);
                if (amt > 0) sources.push({ target: s, amount: amt });
            }
        }

        for (const t of room.find(FIND_TOMBSTONES)) {
            const amt = t.store.getUsedCapacity(RESOURCE_ENERGY);
            if (amt > 0) sources.push({ target: t, amount: amt });
        }

        for (const r of room.find(FIND_RUINS)) {
            const amt = r.store.getUsedCapacity(RESOURCE_ENERGY);
            if (amt > 0) sources.push({ target: r, amount: amt });
        }

        return sources;
    }

    private getRoomSources(room: Room): EnergySource[] {
        const cached = this.resourcesPerRoom.get(room.name);
        if (cached) return cached;

        const sources = this.scanRoom(room).filter(src => {
            const remaining = src.amount - this.getReserved(src.target.id);
            return remaining > 0;
        });

        this.resourcesPerRoom.set(room.name, sources);
        return sources;
    }

    public findBestEnergySource(creep: Creep, destination: Structure | null): EnergyTarget | null {
        const sources = this.getRoomSources(creep.room);
        if (sources.length === 0) return null;

        let best: EnergyTarget | null = null;
        let bestScore = -Infinity;

        for (const { target, amount } of sources) {
            if (!this.isValidSourceFor(target, destination)) {
                continue;
            }

            const reserved = this.getReserved(target.id);

            const creepFreeCapacity = creep.store.getFreeCapacity(RESOURCE_ENERGY);

            const remaining = amount - reserved;
            if (remaining <= 0) continue;

            const gain = Math.min(remaining, creepFreeCapacity);
            const distance = creep.pos.getRangeTo(target.pos);

            // Tunable but intuitive
            const DIST_COST = 2;

            const score = gain - distance * DIST_COST;

            if (score > bestScore) {
                bestScore = score;
                best = target;
            }
        }

        if (!best) {
            return null;
        }

        // Reserve immediately so later creeps see it
        const reserveAmount = creep.store.getFreeCapacity(RESOURCE_ENERGY);
        if (reserveAmount > 0) {
            this.reserve(best.id, reserveAmount);
        }

        return best;
    }
}
