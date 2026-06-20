import { expect } from "../helpers/chai";
import { SpawnRole } from "spawn/types";
import { buildBody } from "spawn/bodies";

describe("buildBody — reserver (claimer)", () => {
    it("builds one CLAIM+MOVE pair at low energy (RCL3 budget)", () => {
        expect(buildBody(SpawnRole.Claimer, 800)).to.deep.equal([CLAIM, MOVE]);
    });

    it("builds two CLAIM+MOVE pairs when affordable (grows the reservation)", () => {
        expect(buildBody(SpawnRole.Claimer, 1300)).to.deep.equal([CLAIM, MOVE, CLAIM, MOVE]);
    });

    it("never exceeds two pairs even with abundant energy", () => {
        expect(buildBody(SpawnRole.Claimer, 5000)).to.deep.equal([CLAIM, MOVE, CLAIM, MOVE]);
    });
});
