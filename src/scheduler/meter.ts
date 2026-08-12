import { CpuMeter } from "shared/scheduling";

/**
 * The real meter — this subsystem's only Game access, and the reason the gate
 * logic in `gates.ts` is pure and host-testable: tests inject a fake meter.
 *
 * `limit` is deliberately `Game.cpu.limit` (the rated per-tick allowance), not
 * `tickLimit` (which includes bucket burst). Budgeting against the burst number
 * spends the bucket every tick and leaves nothing for the tick that needs it.
 */
export const gameCpuMeter: CpuMeter = {
    used: () => Game.cpu.getUsed(),
    limit: () => Game.cpu.limit,
    bucket: () => Game.cpu.bucket
};
