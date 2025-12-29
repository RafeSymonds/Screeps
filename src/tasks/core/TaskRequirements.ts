export interface TaskRequirements {
    mine?: number; // WORK parts worth of throughput for mining only
    work?: number; // WORK parts worth of throughput
    carry?: number; // CARRY parts worth of throughput
    move?: number; // MOVE pressure (optional, advanced)
    vision?: boolean; // needs presence in room
}
