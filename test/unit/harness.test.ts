import { expect } from "../helpers/chai";

/**
 * Placeholder suite: verifies the mocha harness boots with the Screeps globals
 * from test/helpers/setup.ts. Replace with real unit tests as the bot grows.
 */
describe("unit test harness", () => {
    it("provides Screeps game constants", () => {
        expect(BODYPART_COST[WORK]).to.equal(100);
        expect(RESOURCE_ENERGY).to.equal("energy");
    });
});
