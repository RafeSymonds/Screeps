export function roomsWithin(room: string, maxDepth: number): Set<string> {
    const visited = new Set<string>([room]);
    const result = new Set<string>();
    const queue: [string, number][] = [[room, 0]];

    while (queue.length) {
        const [current, depth] = queue.shift()!;
        if (depth === maxDepth) continue;

        const exits = Memory.rooms[current]?.topology?.neighbors;
        if (!exits) continue;

        for (const next of Object.values(exits)) {
            if (visited.has(next)) continue;
            visited.add(next);
            result.add(next);
            queue.push([next, depth + 1]);
        }
    }

    return result;
}
