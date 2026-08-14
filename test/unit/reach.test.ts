import { expect } from "../helpers/chai";
import { RoomType, roomType } from "intel/index";
import { reach } from "intel/reach";

/** A fake map: a room lists only the neighbours that exist, as a real map edge
 *  does, and rooms outside the world cannot be read at all. */
function worldOf(names: string[]): (roomName: string) => string[] | undefined {
    const world = new Set(names);
    return roomName => {
        const m = /^W(\d+)N(\d+)$/.exec(roomName);
        if (!m || !world.has(roomName)) {
            return undefined;
        }
        const x = parseInt(m[1], 10);
        const y = parseInt(m[2], 10);
        return [`W${x - 1}N${y}`, `W${x + 1}N${y}`, `W${x}N${y - 1}`, `W${x}N${y + 1}`].filter(n => world.has(n));
    };
}

/** Every room in a rectangular block, inclusive. */
function block(x0: number, x1: number, y0: number, y1: number): string[] {
    const names: string[] = [];
    for (let x = x0; x <= x1; x++) {
        for (let y = y0; y <= y1; y++) {
            names.push(`W${x}N${y}`);
        }
    }
    return names;
}

describe("reach (exit-graph depth)", () => {
    it("counts border crossings, so a diagonal neighbour is TWO rooms away", () => {
        // The whole reason this exists. getRoomLinearDistance is chebyshev and
        // calls W1N1 one room from W2N2 — but there is no diagonal room exit, so
        // getting there costs two crossings and about twice the walk. Remote
        // hauler counts are sized from this number.
        const { rooms } = reach({ origin: "W2N2", maxDepth: 2, exitsOf: worldOf(block(1, 3, 1, 3)) });
        expect(rooms.get("W2N1")).to.equal(1);
        expect(rooms.get("W1N2")).to.equal(1);
        expect(rooms.get("W1N1")).to.equal(2);
        expect(rooms.get("W2N2")).to.equal(0); // the origin itself
    });

    it("never enters a source-keeper room, in either direction", () => {
        // Their guards are permanent, respawning and lethal. A route THROUGH one
        // kills a creep as surely as a stay in one, so they are cut from the graph
        // rather than merely filtered out of the target list.
        expect(roomType("W14N14")).to.equal(RoomType.SourceKeeper);
        const { rooms } = reach({
            origin: "W13N14",
            maxDepth: 3,
            exitsOf: worldOf(block(11, 16, 12, 16)),
            blocked: name => roomType(name) === RoomType.SourceKeeper
        });
        expect(rooms.has("W14N14")).to.equal(false);
        expect(rooms.get("W12N14")).to.equal(1);
        // W16N14 sits on the far side of the keeper block; the only way around it
        // is longer than maxDepth, so it stays unreachable.
        expect(rooms.has("W16N14")).to.equal(false);
    });

    it("admits a named neighbour it cannot yet read, and says the graph is incomplete", () => {
        // THE bug this file exists to prevent (sim-caught). Verifying a neighbour
        // by asking whether IT answers describeExits looks like a sound existence
        // check and is not: the engine builds its map grid once per isolate from
        // whatever terrain has been shipped, so real, adjacent, walkable rooms
        // answer null until we have been to them. Used as a membership test it
        // deletes exactly the rooms scouting exists to discover — and the
        // blindness is self-sustaining, since a room we never visit never enters
        // the grid. Here W2N1 is real and unreadable; the route to W3N1 runs
        // through it.
        const exitsOf = (roomName: string): string[] | undefined =>
            roomName === "W1N1" ? ["W2N1", "W1N2"] : undefined;
        const { rooms, complete } = reach({ origin: "W1N1", maxDepth: 3, exitsOf });
        expect([...rooms.keys()].sort()).to.deep.equal(["W1N1", "W1N2", "W2N1"]);
        // Unreadable means "cannot expand THROUGH", so anything behind W2N1 is
        // missing and the result must not be cached as final.
        expect(complete).to.equal(false);
    });

    it("stops at maxDepth", () => {
        const exitsOf = worldOf(block(1, 6, 1, 6));
        expect(reach({ origin: "W1N1", maxDepth: 1, exitsOf }).rooms.size).to.equal(3); // self + 2
        expect(reach({ origin: "W1N1", maxDepth: 2, exitsOf }).rooms.get("W3N1")).to.equal(2);
        expect(reach({ origin: "W1N1", maxDepth: 2, exitsOf }).rooms.has("W4N1")).to.equal(false);
    });

    it("reports an incomplete graph rather than a confidently empty one", () => {
        // The caller caches this map for the life of the global, so "the map would
        // not answer" must be distinguishable from "there is nothing out there".
        const result = reach({ origin: "W1N1", maxDepth: 2, exitsOf: () => undefined });
        expect(result.complete).to.equal(false);
        expect(result.rooms.size).to.equal(1);
        expect(reach({ origin: "W2N2", maxDepth: 1, exitsOf: worldOf(block(1, 3, 1, 3)) }).complete).to.equal(true);
    });
});
