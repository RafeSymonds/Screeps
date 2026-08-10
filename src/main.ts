import { ErrorMapper } from "utils/ErrorMapper";
import * as shell from "shell/index";
import type { Assignment } from "shared/assignments";
import type { SubsystemId } from "shared/subsystems";
import type { ShellMemory } from "shell/memory";
import type { StatsMemory } from "telemetry/index";
import type { EconMemory } from "economy/index";
import type { LayoutMemory } from "layout/index";
import type { BuildMemory } from "construction/index";
import type { DefenseMemory } from "defense/index";

declare global {
    /*
     * Ambient Memory extensions (repo convention: declared here, owned per-slice
     * per architecture.md §6). Fields are optional because they may be absent
     * before the owning subsystem runs — owners ensure their own slices.
     */
    interface Memory {
        version?: number;
        shell?: ShellMemory;
        intel?: Record<string, unknown>;
        stats?: StatsMemory;
    }

    interface RoomMemory {
        econ?: EconMemory;
        layout?: LayoutMemory;
        build?: BuildMemory;
        defense?: DefenseMemory;
    }

    interface CreepMemory {
        home?: string;
        owner?: SubsystemId;
        assignment?: Assignment;
    }
}

export const loop = ErrorMapper.wrapLoop(shell.tick);
