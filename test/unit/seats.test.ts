import { expect } from "../helpers/chai";
import { Pos } from "shared/views";
import { TerrainGrid } from "snapshot/terrain";
import { assignSeats, seatTiles } from "creeps/seats";

const pos = (x: number, y: number): Pos => ({ x, y, roomName: "W1N1" });

/** Open terrain unless a tile is listed as wall. */
function terrainWith(walls: Pos[] = []): TerrainGrid {
    const set = new Set(walls.map(w => w.y * 50 + w.x));
    return {
        isWall: (x: number, y: number) => set.has(y * 50 + x),
        isSwamp: () => false
    };
}

const SOURCE = pos(10, 40);
const NO_BLOCKS = new Set<number>();

describe("miner seats", () => {
    describe("seatTiles", () => {
        it("offers every open adjacent tile", () => {
            const seats = seatTiles({ source: SOURCE, terrain: terrainWith(), blocked: NO_BLOCKS });
            expect(seats).to.have.length(8);
            for (const s of seats) {
                expect(Math.max(Math.abs(s.x - SOURCE.x), Math.abs(s.y - SOURCE.y))).to.equal(1);
            }
        });

        it("puts the container tile first — it is the only seat that costs nothing", () => {
            const container = pos(11, 41);
            const seats = seatTiles({ source: SOURCE, terrain: terrainWith(), blocked: NO_BLOCKS, container });
            expect(seats[0]).to.deep.equal(container);
        });

        it("excludes walls and blocking structures", () => {
            const seats = seatTiles({
                source: SOURCE,
                terrain: terrainWith([pos(9, 39), pos(10, 39)]),
                blocked: new Set([41 * 50 + 11])
            });
            expect(seats).to.have.length(5);
            expect(seats.some(s => s.x === 9 && s.y === 39)).to.equal(false);
            expect(seats.some(s => s.x === 11 && s.y === 41)).to.equal(false);
        });

        it("excludes room-edge tiles — a creep standing there is teleported out", () => {
            const edgeSource = pos(1, 1);
            const seats = seatTiles({ source: edgeSource, terrain: terrainWith(), blocked: NO_BLOCKS });
            for (const s of seats) {
                expect(s.x).to.be.within(1, 48);
                expect(s.y).to.be.within(1, 48);
            }
            // (0,0),(1,0),(2,0),(0,1),(0,2) are all edge tiles — 3 of 8 survive.
            expect(seats).to.have.length(3);
        });

        it("is a total function of the room — same input, same order", () => {
            const a = seatTiles({ source: SOURCE, terrain: terrainWith(), blocked: NO_BLOCKS });
            const b = seatTiles({ source: SOURCE, terrain: terrainWith(), blocked: NO_BLOCKS });
            expect(a).to.deep.equal(b);
        });
    });

    describe("assignSeats", () => {
        const seats = seatTiles({ source: SOURCE, terrain: terrainWith(), blocked: NO_BLOCKS, container: pos(11, 41) });

        it("NEVER gives two miners the same tile — the whole point", () => {
            // THE regression test. Field bug: two miners kept targeting one spot
            // and alternated over it, mining nothing.
            const miners = [
                { name: "m1", pos: pos(25, 25) },
                { name: "m2", pos: pos(25, 25) },
                { name: "m3", pos: pos(25, 25) }
            ];
            const got = assignSeats(seats, miners);
            const tiles = [...got.values()].map(p => `${p.x},${p.y}`);
            expect(got.size).to.equal(3);
            expect(new Set(tiles).size).to.equal(3);
        });

        it("gives the container seat to somebody when it is free", () => {
            const got = assignSeats(seats, [{ name: "m1", pos: pos(25, 25) }]);
            expect(got.get("m1")).to.deep.equal(pos(11, 41));
        });

        it("is sticky: a miner already on a seat keeps it when another spawns", () => {
            const sitting = [{ name: "zz", pos: pos(11, 41) }];
            const before = assignSeats(seats, sitting);
            expect(before.get("zz")).to.deep.equal(pos(11, 41));

            // "aa" sorts first, but must NOT evict the working miner — eviction is
            // how a stable-looking rule still produces churn every time a creep
            // is replaced.
            const after = assignSeats(seats, [...sitting, { name: "aa", pos: pos(25, 25) }]);
            expect(after.get("zz")).to.deep.equal(pos(11, 41));
            expect(after.get("aa")).to.not.deep.equal(pos(11, 41));
        });

        it("is stable across ticks for an unchanged roster", () => {
            const miners = [
                { name: "m2", pos: pos(25, 25) },
                { name: "m1", pos: pos(25, 25) }
            ];
            const first = assignSeats(seats, miners);
            const second = assignSeats(seats, [...miners].reverse());
            expect(first.get("m1")).to.deep.equal(second.get("m1"));
            expect(first.get("m2")).to.deep.equal(second.get("m2"));
        });

        it("leaves over-staffed miners seatless rather than double-booking", () => {
            const tight = seatTiles({
                source: SOURCE,
                terrain: terrainWith([pos(9, 39), pos(10, 39), pos(11, 39), pos(9, 40), pos(11, 40), pos(9, 41), pos(10, 41)]),
                blocked: NO_BLOCKS
            });
            expect(tight).to.have.length(1);
            const got = assignSeats(tight, [
                { name: "m1", pos: pos(25, 25) },
                { name: "m2", pos: pos(25, 25) }
            ]);
            expect(got.size).to.equal(1);
        });

        it("handles a source with no reachable seats at all", () => {
            expect(assignSeats([], [{ name: "m1", pos: pos(25, 25) }]).size).to.equal(0);
        });
    });
});
