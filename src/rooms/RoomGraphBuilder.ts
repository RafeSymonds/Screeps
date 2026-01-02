// map/GraphBuilder.ts

import { RoomGraph } from "./RoomGraph";
import { IntelStatus, intelStatus } from "./RoomIntel";

export function buildNormalRoomGraph(rooms: Record<string, RoomMemory>): RoomGraph {
    const graph = new RoomGraph();

    for (const [room, mem] of Object.entries(rooms)) {
        const status = intelStatus(mem.intel);
        if (status !== IntelStatus.OPEN && status !== IntelStatus.DANGEROUS) {
            continue;
        }

        const neighbors = Object.values(mem.topology?.neighbors ?? {}).filter(n => {
            const s = intelStatus(rooms[n]?.intel);
            return s === IntelStatus.OPEN || s === IntelStatus.DANGEROUS;
        });

        graph.edges.set(room, neighbors);
    }

    return graph;
}
