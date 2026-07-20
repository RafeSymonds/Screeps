/**
 * World continuity: room-loss detection, grace-period GC, and respawn
 * (discontinuity) handling — all diffed against the persisted owned-room
 * record, never heap state. See docs/design/shell.md.
 */
import { SubsystemId } from "shared/subsystems";
import { alert, AlertKind, log } from "telemetry/index";
import { KEEP_ON_RESET, resetExcept, ShellMemory } from "shell/memory";

export { KEEP_ON_RESET };

/** Ticks a lost room's slices linger before GC (post-mortem window). Provisional. */
export const LOST_ROOM_GRACE = 3000;

function shellMemory(): ShellMemory {
    return Memory.shell as ShellMemory;
}

function respawnReset(ownedNow: string[]): void {
    resetExcept(KEEP_ON_RESET);
    Memory.creeps = {};
    Memory.shell = { owned: [...ownedNow], lostAt: {} };
    alert(AlertKind.Discontinuity, `respawn detected — new world: ${ownedNow.join(", ")}`);
}

export function checkWorldContinuity(ownedNow: string[]): void {
    const shell = shellMemory();
    const rememberedWorld = Object.keys(Memory.rooms).length > 0 || Object.keys(shell.lostAt).length > 0;

    if (shell.owned.length === 0 && ownedNow.length > 0 && rememberedWorld) {
        respawnReset(ownedNow);
        return;
    }

    const nowSet = new Set(ownedNow);
    for (const name of shell.owned) {
        if (!nowSet.has(name)) {
            alert(AlertKind.RoomLost, `lost room ${name}`);
            log.warn(SubsystemId.Shell, () => `room ${name} no longer owned; GC in ${LOST_ROOM_GRACE} ticks`);
            shell.lostAt[name] = Game.time;
        }
    }
    for (const name of ownedNow) {
        delete shell.lostAt[name];
    }
    for (const [name, lostTick] of Object.entries(shell.lostAt)) {
        if (Game.time - lostTick >= LOST_ROOM_GRACE) {
            delete Memory.rooms[name];
            delete shell.lostAt[name];
        }
    }
    shell.owned = ownedNow;
}
