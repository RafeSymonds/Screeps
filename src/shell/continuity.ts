/**
 * World continuity: room-loss detection, grace-period GC, and respawn
 * (discontinuity) handling — all diffed against the persisted owned-room
 * record, never heap state. See docs/design/shell.md.
 *
 * ## The scenario this exists for
 *
 * You can lose every room and be placed somewhere completely new. Memory survives
 * that, so without detection the bot would spend forever acting on plans for
 * rooms in another part of the map. Respawn is inferred rather than signalled:
 * we owned nothing, we remember rooms, and now we own something — that
 * combination cannot happen any other way.
 *
 * All detection diffs against `Memory.shell.owned`, never heap state, because
 * the gap being detected can span hours of downtime and any number of resets.
 *
 * ## Losing a room is not losing the world
 *
 * A single room lost to a raid gets a grace period, not a reset: its slices
 * linger for `LOST_ROOM_GRACE` ticks so post-mortem state is available and a
 * re-claim inside the window costs nothing. Total loss deliberately does NOT
 * reset either — we are dead awaiting respawn placement, and wiping intel then
 * would destroy exactly what the next world wants for choosing where to expand.
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

/**
 * Reconcile remembered ownership with reality, once per tick.
 *
 * `rememberedWorld` is the discriminator between "fresh world, first tick ever"
 * (nothing remembered → just record) and "respawn" (rooms remembered but none
 * owned until now → full reset). It also catches deploying this bot over another
 * bot's leftover Memory, which is the same problem wearing a different hat.
 */
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
