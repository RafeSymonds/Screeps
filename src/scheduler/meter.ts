import { CpuMeter } from "shared/scheduling";

/** The real meter — this subsystem's only Game access. */
export const gameCpuMeter: CpuMeter = {
    used: () => Game.cpu.getUsed(),
    limit: () => Game.cpu.limit,
    bucket: () => Game.cpu.bucket
};
