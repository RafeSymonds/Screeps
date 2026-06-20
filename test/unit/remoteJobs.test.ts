import { expect } from "../helpers/chai";
import { JobBoard } from "jobs/JobBoard";
import { JobKind } from "jobs/types";
import { World } from "world/World";
import { generateRemoteJobs } from "jobs/generators/RemoteJobGenerator";

function fakeWorld(ownerNames: string[]): World {
    return { myRooms: ownerNames.map(name => ({ name })) } as unknown as World;
}

describe("generateRemoteJobs", () => {
    it("creates a harvest job per source of an active remote, with pos from intel", () => {
        Memory.empire = {
            remotes: {
                W2N1: { roomName: "W2N1", owner: "W1N1", sources: ["sa", "sb"], distance: 50, active: true, reserve: false }
            }
        };
        Memory.rooms = {
            W2N1: {
                intel: {
                    lastSeen: 1,
                    hostiles: 0,
                    sources: [
                        { id: "sa", x: 12, y: 34 },
                        { id: "sb", x: 40, y: 10 }
                    ]
                }
            }
        };
        const board = new JobBoard();
        board.rehydrate();

        generateRemoteJobs(fakeWorld(["W1N1"]), board);

        const a = board.get("harvest:sa")!;
        expect(a.kind).to.equal(JobKind.Harvest);
        expect(a.roomName).to.equal("W2N1");
        expect(a.pos).to.deep.equal({ x: 12, y: 34, roomName: "W2N1" });
        expect(a.demand).to.deep.equal({ work: 5, carry: 0 });
        expect(board.get("harvest:sb")).to.not.equal(undefined);
    });

    it("generates nothing for an inactive (paused) remote", () => {
        Memory.empire = {
            remotes: {
                W2N1: { roomName: "W2N1", owner: "W1N1", sources: ["sa"], distance: 50, active: false, reserve: false }
            }
        };
        Memory.rooms = { W2N1: { intel: { lastSeen: 1, hostiles: 0, sources: [{ id: "sa", x: 5, y: 5 }] } } };
        const board = new JobBoard();
        board.rehydrate();

        generateRemoteJobs(fakeWorld(["W1N1"]), board);

        expect(board.all()).to.deep.equal([]);
    });

    it("prunes a stale job left from an abandoned remote, keeping local jobs", () => {
        Memory.empire = { remotes: {} }; // no active remotes
        Memory.rooms = {};
        const board = new JobBoard();
        board.rehydrate();
        // A leftover remote harvest job (room W2N1, not owned, not active) ...
        board.upsert({
            id: "harvest:sa",
            kind: JobKind.Harvest,
            roomName: "W2N1",
            capacity: 1,
            assigned: [],
            priority: 80,
            demand: { work: 5, carry: 0 }
        });
        // ... and a local job in the owned room, which must survive.
        board.upsert({
            id: "upgrade:W1N1",
            kind: JobKind.Upgrade,
            roomName: "W1N1",
            capacity: 4,
            assigned: [],
            priority: 40,
            demand: { work: 1, carry: 1 }
        });

        generateRemoteJobs(fakeWorld(["W1N1"]), board);

        expect(board.get("harvest:sa")).to.equal(undefined);
        expect(board.get("upgrade:W1N1")).to.not.equal(undefined);
    });

    it("ignores a remote owned by a different room", () => {
        Memory.empire = {
            remotes: {
                W2N1: { roomName: "W2N1", owner: "W9N9", sources: ["sa"], distance: 50, active: true, reserve: false }
            }
        };
        Memory.rooms = { W2N1: { intel: { lastSeen: 1, hostiles: 0, sources: [{ id: "sa", x: 5, y: 5 }] } } };
        const board = new JobBoard();
        board.rehydrate();

        generateRemoteJobs(fakeWorld(["W1N1"]), board);

        expect(board.all()).to.deep.equal([]);
    });
});
