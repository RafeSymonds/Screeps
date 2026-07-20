import { ErrorMapper } from "utils/ErrorMapper";
import * as shell from "shell/index";
import type { ShellMemory } from "shell/memory";
import type { StatsMemory } from "telemetry/index";

declare global {
    /*
     * Ambient Memory extensions (repo convention: declared here, owned per-slice
     * per architecture.md §6). Fields are optional because they may be absent
     * before the shell's bootstrap runs — owners ensure their own slices.
     */
    interface Memory {
        version?: number;
        shell?: ShellMemory;
        intel?: Record<string, unknown>;
        stats?: StatsMemory;
    }
}

export const loop = ErrorMapper.wrapLoop(shell.tick);
