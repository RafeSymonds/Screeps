import { SpawnRequest } from "spawn/types";

/**
 * Ephemeral per-tick collector for controller spawn requests. Built fresh each
 * tick; controllers push, SpawnManager drains by room ordered by priority.
 */
export class SpawnRequestQueue {
    private requests: SpawnRequest[] = [];

    public push(request: SpawnRequest): void {
        this.requests.push(request);
    }

    public pushAll(requests: SpawnRequest[]): void {
        for (const request of requests) {
            this.requests.push(request);
        }
    }

    /** Requests for a room, highest priority first. */
    public forRoom(roomName: string): SpawnRequest[] {
        return this.requests.filter(request => request.roomName === roomName).sort((a, b) => b.priority - a.priority);
    }
}
