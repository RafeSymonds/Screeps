type TaskData = {
    id: number;
    kind: TaskKind; // "build" | "upgrade" | "haul" | ...
    room: string; // room name (important later)
    targetId?: Id<any>; // Screeps object ID
    state: "open" | "assigned" | "done";
    assignedAgent: [Id<Creep>]; // creep name
    params: Record<string, any>;
};
