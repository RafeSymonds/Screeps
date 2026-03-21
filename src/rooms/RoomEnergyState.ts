import { WorldRoom } from "world/WorldRoom";

export type EnergyTarget = StructureContainer | StructureStorage | Tombstone | Ruin | Resource;

export interface EnergySource {
    target: EnergyTarget;
    amount: number;
}

/* ================================
   RESERVATIONS
   ================================ */

interface TargetReservation {
    owner: Id<Creep>;
    amount: number;
}

/* ================================
   ROOM ENERGY STATE
   ================================ */

export class RoomEnergyState {
    readonly room: Room;

    private sources: EnergySource[] = [];

    /**
     * Fine-grained execution reservations:
     * container/storage → list of (creep, amount)
     */
    private targetReservations = new Map<Id<EnergyTarget>, TargetReservation[]>();
    private remoteReservations = 0;

    private sourceContainers = new Set<Id<StructureContainer>>();
    private needyContainers = new Set<Id<StructureContainer>>();

    constructor(worldRoom: WorldRoom) {
        this.room = worldRoom.room;
        this.analyzeContainers();
        this.scanSources();
    }

    /* ================================
       ANALYSIS
       ================================ */

    private analyzeContainers(): void {
        for (const s of this.room.find(FIND_STRUCTURES)) {
            if (!(s instanceof StructureContainer)) continue;

            const tied =
                s.pos.findInRange(FIND_SOURCES, 1).length > 0 || s.pos.findInRange(FIND_MINERALS, 1).length > 0;

            if (tied) this.sourceContainers.add(s.id);
            else this.needyContainers.add(s.id);
        }
    }

    private scanSources(): void {
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

    /* ================================
       TARGET-LEVEL RESERVATIONS
       ================================ */

    private getTargetReserved(id: Id<EnergyTarget>): number {
        const list = this.targetReservations.get(id);
        if (!list) return 0;
        return list.reduce((sum, r) => sum + r.amount, 0);
    }

    reserveTarget(targetId: Id<EnergyTarget>, creep: Creep, amount: number): void {
        const list = this.targetReservations.get(targetId) ?? [];

        list.push({
            owner: creep.id,
            amount
        });

        this.targetReservations.set(targetId, list);
    }

    reserveRemoteEnergy(amount: number): void {
        this.remoteReservations += amount;
    }

    releaseTargetReservations(creepId: Id<Creep>): void {
        for (const [id, list] of this.targetReservations) {
            const filtered = list.filter(r => r.owner !== creepId);
            if (filtered.length === 0) {
                this.targetReservations.delete(id);
            } else {
                this.targetReservations.set(id, filtered);
            }
        }
    }

    /* ================================
       QUERIES
       ================================ */

    /**
     * Physical energy remaining after execution-level reservations.
     * DOES NOT include room-level reservations.
     */
    getAvailableEnergy(): number {
        let total = 0;

        for (const { target, amount } of this.sources) {
            const reserved = this.getTargetReserved(target.id);
            total += Math.max(0, amount - reserved);
        }

        return total - this.remoteReservations;
    }

    isValidSourceFor(from: EnergyTarget, to: Structure | RoomPosition | null): boolean {
        if (to === null) return true;

        if (to instanceof Structure && "id" in from && from.id === (to as any).id) {
            return false;
        }

        const fromPos = from instanceof RoomPosition ? from : from.pos;
        const toPos = to instanceof RoomPosition ? to : to.pos;

        // Don't pick up from exactly where we are dropping, UNLESS it's a dropped resource.
        // If it's on the floor, we want to grab it regardless of proximity to the sink.
        if (!(from instanceof Resource) && fromPos.getRangeTo(toPos) <= 1) {
            return false;
        }

        if (from instanceof StructureStorage) return true;
        if (!(from instanceof StructureContainer)) return true;

        // If it's a source container, it's always a valid source.
        if (this.sourceContainers.has(from.id)) return true;

        // If it's a needy container, it's NOT a valid source for another container.
        if (this.needyContainers.has(from.id)) {
            if (to instanceof StructureContainer && this.needyContainers.has(to.id)) {
                return false;
            }
        }

        return true;
    }

    /* ================================
       SOURCE SELECTION (PROMOTION)
       ================================ */

    /**
     * Finds best energy source and PROMOTES
     * the creep’s room-level reservation
     * into a target-level reservation.
     */
    findBestSource(creep: Creep, destination: Structure | RoomPosition | null): EnergyTarget | null {
        let best: EnergyTarget | null = null;
        let bestScore = -Infinity;

        for (const { target, amount } of this.sources) {
            if (!this.isValidSourceFor(target, destination)) continue;

            const remaining = amount - this.getTargetReserved(target.id);

            if (remaining <= 0) continue;

            const gain = Math.min(remaining, creep.store.getFreeCapacity(RESOURCE_ENERGY));

            const distFromCreep = creep.pos.getRangeTo(target.pos);
            const distToTarget = destination ? target.pos.getRangeTo(destination) : 0;

            // Score based on gain, with lighter penalties for distance.
            // Bonus for dropped resources to encourage floor pickups (keeps the room clean).
            const floorBonus = target instanceof Resource ? 50 : 0;
            const score = gain + floorBonus - distFromCreep * 2 - distToTarget;

            if (score > bestScore) {
                bestScore = score;
                best = target;
            }
        }

        if (best) {
            const amt = creep.store.getFreeCapacity(RESOURCE_ENERGY);

            this.reserveTarget(best.id, creep, amt);
            creep.memory.energyTargetId = best.id;
        }

        return best;
    }
}
