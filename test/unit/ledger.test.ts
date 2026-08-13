import { expect } from "../helpers/chai";
import { createLedger, NULL_LEDGER } from "creeps/ledger";

describe("energy ledger", () => {
    it("hands a small pile to ONE creep and shows it empty to the rest", () => {
        // THE regression test. Field report: "we are now sending 10 creeps to pick
        // up 30 energy. one creep picks it all up and then they all go back."
        const ledger = createLedger();
        const PILE = "p1";
        const AMOUNT = 30;
        const takers: number[] = [];
        for (let creep = 0; creep < 10; creep++) {
            if (ledger.remaining(PILE, AMOUNT) > 0) {
                takers.push(creep);
                ledger.claim(PILE, 50); // this creep's free capacity
            }
        }
        expect(takers).to.deep.equal([0]);
    });

    it("lets a big pile satisfy several creeps", () => {
        const ledger = createLedger();
        let served = 0;
        for (let i = 0; i < 10; i++) {
            if (ledger.remaining("big", 500) >= 50) {
                served++;
                ledger.claim("big", 50);
            }
        }
        expect(served).to.equal(10);
    });

    it("tracks each source independently", () => {
        const ledger = createLedger();
        ledger.claim("a", 100);
        expect(ledger.remaining("a", 100)).to.equal(0);
        expect(ledger.remaining("b", 100)).to.equal(100);
    });

    it("never reports a negative remainder", () => {
        const ledger = createLedger();
        ledger.claim("a", 5000);
        expect(ledger.remaining("a", 100)).to.equal(0);
    });

    it("NULL_LEDGER reserves nothing — the single-creep default", () => {
        NULL_LEDGER.claim("a", 100);
        expect(NULL_LEDGER.remaining("a", 100)).to.equal(100);
    });
});
