import { JobBoard } from "jobs/JobBoard";
import { World } from "world/World";
import { generateBuildJobs } from "jobs/generators/BuildJobGenerator";
import { generateHarvestJobs } from "jobs/generators/HarvestJobGenerator";
import { generateHaulJobs } from "jobs/generators/HaulJobGenerator";
import { generateRemoteJobs } from "jobs/generators/RemoteJobGenerator";
import { generateRepairJobs } from "jobs/generators/RepairJobGenerator";
import { generateUpgradeJobs } from "jobs/generators/UpgradeJobGenerator";
import { WorldRoom } from "world/WorldRoom";

type RoomGenerator = (worldRoom: WorldRoom, board: JobBoard) => void;

/**
 * Registry of economy job generators. Adding a new economic job kind is just
 * adding a generator here — nothing else in the pipeline changes.
 */
const GENERATORS: RoomGenerator[] = [
    generateHarvestJobs,
    generateHaulJobs,
    generateUpgradeJobs,
    generateBuildJobs,
    generateRepairJobs
];

export function generateJobs(world: World, board: JobBoard): void {
    for (const worldRoom of world.myRooms) {
        for (const generator of GENERATORS) {
            generator(worldRoom, board);
        }
    }
    // Remote harvest jobs are driven by the empire plan (not world.myRooms), so
    // they generate once per owned room's assigned remotes, outside the loop above.
    generateRemoteJobs(world, board);
}
