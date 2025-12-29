export interface TaskRequirements {
    work?: number; // WORK parts worth of throughput
    carry?: number; // CARRY parts worth of throughput
    move?: number; // MOVE pressure (optional, advanced)
    vision?: boolean; // needs presence in room
}
