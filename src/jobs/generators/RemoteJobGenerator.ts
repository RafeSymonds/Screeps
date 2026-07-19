import { JOB_PRIORITY } from "config/constants";
import { JobBoard } from "jobs/JobBoard";
import { JobKind, SerializedPos } from "jobs/types";
import { World } from "world/World";
import { activeRemotesFor } from "empire/Empire";

/**
 * Remote economy jobs — the economy's reach into assigned remotes. Driven by the
 * empire plan and INTEL (not vision), with positions set so the jobs exist and can
 * be travelled to before the bot has eyes on the room:
 *
 *   - one `harvest:<sourceId>` per remote source (a pure drop-miner; same id scheme
 *     and kind as local harvest — no new job kind, just a new generation site).
 *   - one `haul:<remoteRoom>` cross-room haul job: gather the dropped output in the
 *     remote and deliver it to the owner's storage. `data.homeRoom` marks it remote
 *     so the executor runs the cross-room path.
 *
 * The matcher's scope gate keeps these jobs to the remote's own (targetRoom) creeps.
 */
export function generateRemoteJobs(world: World, board: JobBoard): void {
    const ownedRooms = new Set(world.myRooms.map(room => room.name));
    const activeRemoteRooms = new Set<string>();

    for (const ownerRoom of world.myRooms) {
        for (const remote of activeRemotesFor(ownerRoom.name)) {
            const intel = Memory.rooms[remote.roomName]?.intel;
            if (!intel) {
                continue;
            }
            activeRemoteRooms.add(remote.roomName);

            let firstSourcePos: SerializedPos | undefined;
            for (const sourceId of remote.sources) {
                const source = intel.sources.find(candidate => candidate.id === sourceId);
                if (!source) {
                    continue;
                }
                const pos: SerializedPos = { x: source.x, y: source.y, roomName: remote.roomName };
                firstSourcePos ??= pos;
                board.upsert({
                    id: `harvest:${sourceId}`,
                    kind: JobKind.Harvest,
                    roomName: remote.roomName,
                    targetId: sourceId,
                    pos,
                    // Two seats, not one: a low-energy room fields undersized (<5 WORK)
                    // remote miners, and the demand model tops the source up with a
                    // second one — which needs a seat, or it is scope-locked idle. The
                    // spare seat is unused once a single full miner meets demand, and
                    // the matcher scope gate keeps home creeps from ever taking it.
                    capacity: 2,
                    assigned: [],
                    priority: JOB_PRIORITY[JobKind.Harvest],
                    // A pure (drop-mining) miner; haulers ferry the output home.
                    demand: { work: 5, carry: 0 }
                });
            }

            if (firstSourcePos) {
                board.upsert({
                    id: `haul:${remote.roomName}`,
                    kind: JobKind.Haul,
                    roomName: remote.roomName,
                    pos: firstSourcePos, // where a hauler waits for output before it's dropped
                    capacity: Math.max(2, remote.sources.length * 2),
                    assigned: [],
                    priority: JOB_PRIORITY[JobKind.Haul],
                    demand: { work: 0, carry: 4 },
                    data: { homeRoom: ownerRoom.name }
                });
            }
        }
    }

    // Drop jobs for remotes that are no longer active (paused by threat or dropped
    // from the plan): any job in a room that is neither owned nor a currently-active
    // remote. board.remove also clears the assignees' jobId so they re-match (and,
    // with targetRoom cleared by the empire, fold back into the home economy).
    for (const job of board.all()) {
        if (!ownedRooms.has(job.roomName) && !activeRemoteRooms.has(job.roomName)) {
            board.remove(job.id);
        }
    }
}
