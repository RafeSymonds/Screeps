/** A source as recorded by scouting — id + position so a remote harvest job can
 *  be generated (with `pos`) before the bot has vision of the room. */
export interface SourceIntel {
    id: string;
    x: number;
    y: number;
}

/** A remote controller's reservation, when present. */
export interface ReservationIntel {
    username: string;
    ticks: number;
}

/** Per-room scouting snapshot. Tolerate staleness — `lastSeen` ages it. */
export interface RoomIntel {
    lastSeen: number;
    /** Sources with ids + positions (was a bare count pre-v2). */
    sources: SourceIntel[];
    controllerId?: string;
    controllerLevel?: number;
    /** Controller owner username (undefined = unowned/neutral). */
    owner?: string;
    /** Active controller reservation (whose, and how many ticks remain). */
    reservation?: ReservationIntel;
    hostiles: number;
    /** An Invader Core is present (blocks reservation, signals an invader wave). */
    invaderCore?: boolean;
    /** Source Keeper lairs are present (dangerous — excluded from remote selection). */
    sourceKeeper?: boolean;
}
