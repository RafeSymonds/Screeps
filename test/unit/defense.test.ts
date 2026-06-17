import { expect } from "../helpers/chai";
import { assessDefense } from "defense/Defense";
import { World } from "world/World";

describe("assessDefense", () => {
    it("activates safe mode when an attacker reaches an undefended spawn", () => {
        let activated = false;
        const controller = {
            my: true,
            safeMode: undefined,
            safeModeCooldown: undefined,
            safeModeAvailable: 1,
            activateSafeMode: () => {
                activated = true;
                return OK;
            }
        };
        const hostile = {
            pos: { getRangeTo: () => 1 },
            getActiveBodyparts: (part: BodyPartConstant) => (part === ATTACK ? 2 : 0)
        };
        const worldRoom = {
            name: "W1N1",
            controller,
            hostiles: [hostile],
            spawns: [{}],
            towers: []
        };
        const world = { myRooms: [worldRoom] } as unknown as World;

        assessDefense(world);

        expect(activated).to.equal(true);
        expect(Memory.rooms["W1N1"].defense?.threat).to.equal(1);
    });

    it("does not trigger safe mode when towers are present", () => {
        let activated = false;
        const controller = {
            my: true,
            safeModeAvailable: 1,
            activateSafeMode: () => {
                activated = true;
                return OK;
            }
        };
        const hostile = {
            pos: { getRangeTo: () => 1 },
            getActiveBodyparts: (part: BodyPartConstant) => (part === ATTACK ? 2 : 0)
        };
        const worldRoom = { name: "W1N1", controller, hostiles: [hostile], spawns: [{}], towers: [{}] };
        const world = { myRooms: [worldRoom] } as unknown as World;

        assessDefense(world);
        expect(activated).to.equal(false);
    });
});
