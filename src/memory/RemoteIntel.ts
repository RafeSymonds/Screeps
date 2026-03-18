interface RemoteRoomIntel {
    roomName: string;

    // Static
    sources: Id<Source>[];
    mineral?: Id<Mineral>;
    exits: string[];

    // Semi-static
    controller?: {
        id: Id<StructureController>;
        owner?: string;
        reservedBy?: string;
    };

    // Safety
    hostileOwner: boolean;
    lastSeen: number;
}
