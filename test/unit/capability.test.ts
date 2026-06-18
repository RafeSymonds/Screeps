import { expect } from "../helpers/chai";
import { canPerform } from "matching/capability";
import { Job, JobKind } from "jobs/types";
import { makeCreep } from "../helpers/mock";

function job(kind: JobKind): Job {
    return { id: "j", kind, roomName: "W1N1", capacity: 1, assigned: [], priority: 1, demand: { work: 0, carry: 0 } };
}

describe("capability.canPerform", () => {
    it("lets a WORK+CARRY creep perform every economy job", () => {
        const creep = makeCreep({ body: [WORK, CARRY, MOVE] });
        expect(canPerform(creep, job(JobKind.Harvest))).to.equal(true);
        expect(canPerform(creep, job(JobKind.Haul))).to.equal(true);
        expect(canPerform(creep, job(JobKind.Upgrade))).to.equal(true);
        expect(canPerform(creep, job(JobKind.Build))).to.equal(true);
        expect(canPerform(creep, job(JobKind.Repair))).to.equal(true);
    });

    it("rejects a CARRY-only creep from WORK jobs but allows hauling", () => {
        const creep = makeCreep({ body: [CARRY, MOVE] });
        expect(canPerform(creep, job(JobKind.Harvest))).to.equal(false);
        expect(canPerform(creep, job(JobKind.Upgrade))).to.equal(false);
        expect(canPerform(creep, job(JobKind.Build))).to.equal(false);
        expect(canPerform(creep, job(JobKind.Repair))).to.equal(false);
        expect(canPerform(creep, job(JobKind.Haul))).to.equal(true);
    });
});
