// map/RoomGraph.ts

export class RoomGraph {
    edges = new Map<string, string[]>();

    neighbors(room: string): readonly string[] {
        return this.edges.get(room) ?? [];
    }
}
