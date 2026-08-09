/**
 * Plain-data views of game state — the contract between the snapshot and every
 * decision core. Optional fields are omitted when absent, never set to
 * `undefined`, so views JSON-round-trip exactly. See docs/design/snapshot.md.
 */

export interface Pos {
    x: number;
    y: number;
    roomName: string;
}

/** Resource-typed from day one (architecture §7 seam 1). */
export interface StoreView {
    free: number;
    used: number;
    byResource: Partial<Record<ResourceConstant, number>>;
}

export interface CreepView {
    name: string;
    id: Id<Creep>;
    pos: Pos;
    hits: number;
    hitsMax: number;
    /** Omitted while spawning. */
    ticksToLive?: number;
    spawning: boolean;
    /** Counts of ALL parts, damaged or not; active-part counts are a consumer computation. */
    bodyCounts: Partial<Record<BodyPartConstant, number>>;
    store: StoreView;
    /** Live reference, read-only by convention (architecture §6 ownership rules). */
    memory: Readonly<CreepMemory>;
}

export interface StructureView {
    id: Id<AnyStructure>;
    type: StructureConstant;
    pos: Pos;
    hits: number;
    hitsMax: number;
    /** Present iff the structure has a store. */
    store?: StoreView;
    /** Present on spawn structures: true while a creep is in the tube. */
    spawning?: boolean;
}

export type StructuresByType = Partial<Record<StructureConstant, StructureView[]>>;

export interface ControllerView {
    id: Id<StructureController>;
    pos: Pos;
    level: number;
    my: boolean;
    progress: number;
    progressTotal: number;
    ticksToDowngrade: number;
    safeMode?: number;
    safeModeAvailable: number;
    upgradeBlocked?: number;
}

export interface SourceView {
    id: Id<Source>;
    pos: Pos;
    energy: number;
    energyCapacity: number;
}

export interface MineralView {
    id: Id<Mineral>;
    pos: Pos;
    type: MineralConstant;
    amount: number;
}

export interface ConstructionSiteView {
    id: Id<ConstructionSite>;
    pos: Pos;
    type: StructureConstant;
    progress: number;
    progressTotal: number;
}

export interface HostileView {
    id: Id<Creep>;
    pos: Pos;
    owner: string;
    hits: number;
    bodyCounts: Partial<Record<BodyPartConstant, number>>;
}

export interface DroppedView {
    id: Id<Resource>;
    pos: Pos;
    resource: ResourceConstant;
    amount: number;
}

export interface RoomSnapshot {
    name: string;
    my: boolean;
    controller?: ControllerView;
    energyAvailable: number;
    energyCapacityAvailable: number;
    sources: SourceView[];
    mineral?: MineralView;
    structures: StructuresByType;
    myConstructionSites: ConstructionSiteView[];
    hostiles: HostileView[];
    dropped: DroppedView[];
}

export interface WorldSnapshot {
    time: number;
    /** Owned rooms, built eagerly. */
    myRooms: RoomSnapshot[];
    /** Other visible rooms, built on demand; adapter-layer callers only. */
    room(name: string): RoomSnapshot | undefined;
    myCreeps: CreepView[];
}
