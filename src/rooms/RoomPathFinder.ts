import { RoomGraph } from "./RoomGraph";

export function findRoomPath(graph: RoomGraph, start: string, goal: string): string[] | null {
    if (start === goal) return [start];

    const queue: string[] = [start];
    const cameFrom = new Map<string, string | null>();
    cameFrom.set(start, null);

    while (queue.length) {
        const cur = queue.shift()!;
        for (const next of graph.neighbors(cur)) {
            if (cameFrom.has(next)) continue;
            cameFrom.set(next, cur);
            if (next === goal) break;
            queue.push(next);
        }
    }

    if (!cameFrom.has(goal)) return null;

    const path: string[] = [];
    for (let cur: string | null = goal; cur; cur = cameFrom.get(cur)!) {
        path.push(cur);
    }

    return path.reverse();
}
