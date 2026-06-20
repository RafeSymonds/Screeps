import { Job, JobKind } from "jobs/types";
import { JobBoard } from "jobs/JobBoard";
import { World } from "world/World";
import { WorldRoom } from "world/WorldRoom";
import { LogisticsLedger } from "actions/ledger";
import { moveToRoom } from "actions/primitives";
import { runBuild } from "actions/executors/build";
import { runHarvest } from "actions/executors/harvest";
import { runHaul, runRemoteHaul } from "actions/executors/haul";
import { runRepair } from "actions/executors/repair";
import { runUpgrade } from "actions/executors/upgrade";

type Executor = (creep: Creep, job: Job, worldRoom: WorldRoom, ledger: LogisticsLedger) => void;

/**
 * Registry mapping each job kind to its executor. Adding a job kind adds one
 * entry here — runCreep and everything above it stays untouched.
 */
const EXECUTORS: Record<JobKind, Executor> = {
    [JobKind.Harvest]: runHarvest,
    [JobKind.Haul]: runHaul,
    [JobKind.Upgrade]: runUpgrade,
    [JobKind.Build]: runBuild,
    [JobKind.Repair]: runRepair
};

/**
 * Execute one economy creep's assigned job. This is the documented insertion
 * point for the future task-chaining layer: when a creep carries a task stack,
 * dispatch to a TaskRunner here instead of the single-job executor.
 */
export function runCreep(creep: Creep, board: JobBoard, world: World, ledger: LogisticsLedger): void {
    const jobId = creep.memory.jobId;
    if (!jobId) {
        return;
    }
    const job = board.get(jobId);
    if (!job) {
        delete creep.memory.jobId;
        return;
    }
    // Cross-room (remote) haul operates in two rooms and must run even while the
    // remote (job.roomName) is unseen — it owns its own travel — so it is routed
    // before the single-room visibility gate below.
    if (job.kind === JobKind.Haul && job.data?.homeRoom) {
        runRemoteHaul(creep, job, world, ledger);
        return;
    }
    const worldRoom = world.getRoom(job.roomName);
    if (!worldRoom) {
        // The job's room isn't visible — a remote we haven't reached yet. Travel
        // there to gain vision; the executor takes over once the room is in the
        // world model. (Cross-room haul, which operates while the remote is unseen,
        // is routed before this gate in a later stage.)
        moveToRoom(creep, job.roomName);
        return;
    }
    EXECUTORS[job.kind](creep, job, worldRoom, ledger);
}
