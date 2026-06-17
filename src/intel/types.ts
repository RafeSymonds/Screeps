/** Per-room scouting snapshot. Tolerate staleness — `lastSeen` ages it. */
export interface RoomIntel {
    lastSeen: number;
    sources: number;
    controllerLevel?: number;
    owner?: string;
    hostiles: number;
}
