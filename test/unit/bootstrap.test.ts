import { expect } from "../helpers/chai";
import { ensureCreepMemory } from "memory/bootstrap";
import { SpawnRole } from "spawn/types";

/** Build a live creep with the given memory, located in `roomName`. */
function liveCreep(name: string, memory: Partial<CreepMemory>, roomName = "W1N1"): Creep {
    return { name, memory: memory as CreepMemory, room: { name: roomName } } as unknown as Creep;
}

describe("ensureCreepMemory (self-healing creep memory)", () => {
    it("backfills home/spawnRole/working for a creep with empty memory", () => {
        // A creep that appeared without going through SpawnManager (engine-injected,
        // claimed, or surviving a schema change) — its memory is an empty object.
        const mem = {} as CreepMemory;
        Game.creeps["ghost"] = liveCreep("ghost", mem);

        ensureCreepMemory();

        expect(mem.home).to.equal("W1N1");
        expect(mem.spawnRole).to.equal(SpawnRole.Worker);
        expect(mem.working).to.equal(false);
    });

    it("leaves an already-populated memory untouched", () => {
        const mem: CreepMemory = {
            home: "W2N2",
            spawnRole: SpawnRole.Miner,
            working: true,
            jobId: "harvest:x"
        };
        Game.creeps["real"] = liveCreep("real", mem);

        ensureCreepMemory();

        expect(mem.home).to.equal("W2N2");
        expect(mem.spawnRole).to.equal(SpawnRole.Miner);
        expect(mem.working).to.equal(true);
        expect(mem.jobId).to.equal("harvest:x");
    });
});
