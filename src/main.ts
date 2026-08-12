/**
 * Entry point. Deliberately contains no logic: the engine calls `loop` once per
 * tick, and everything about what a tick IS lives in shell/index.ts.
 *
 * What this file does own is the ambient Memory schema — the one place you can
 * read the entire persisted shape of the bot at a glance. Each slice is declared
 * here and owned by exactly one subsystem (architecture.md §6); every field is
 * optional because Memory may predate the subsystem that fills it.
 *
 * `ErrorMapper.wrapLoop` is the outermost safety net: it catches anything that
 * escapes the shell's own containment and maps the stack trace back through the
 * bundle's source map, so a production stack names real files and lines.
 */
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
import type { SpawnMemory } from "spawn/index";
import type { IntelMemory } from "intel/index";
import type { RemotesMemory } from "remotes/index";
import type { EmpireMemory } from "empire/index";
import type { ExpansionMemory } from "expansion/index";

declare global {
    /*
     * Ambient Memory extensions (repo convention: declared here, owned per-slice
     * per architecture.md §6). Fields are optional because they may be absent
     * before the owning subsystem runs — owners ensure their own slices.
     */
    interface Memory {
        version?: number;
        shell?: ShellMemory;
        intel?: IntelMemory;
        stats?: StatsMemory;
        empire?: EmpireMemory;
        expansion?: ExpansionMemory;
    }

    interface RoomMemory {
        econ?: EconMemory;
        layout?: LayoutMemory;
        build?: BuildMemory;
        defense?: DefenseMemory;
        remotes?: RemotesMemory;
        spawn?: SpawnMemory;
    }

    interface CreepMemory {
        home?: string;
        owner?: SubsystemId;
        assignment?: Assignment;
    }
}

export const loop = ErrorMapper.wrapLoop(shell.tick);
