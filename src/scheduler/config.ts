/**
 * Scheduler gate thresholds — the one named config (architecture §5.2).
 * Provisional values, to be revised from real telemetry.
 */
export interface SchedulerConfig {
    /** Class B skipped when bucket is below this. */
    bucketFloorB: number;
    /** Class C skipped when bucket is below this. */
    bucketFloorC: number;
    /** Class B skipped when used exceeds this fraction of the rated limit. */
    headroomB: number;
    /** Class C skipped when used exceeds this fraction of the rated limit. */
    headroomC: number;
}

export const SCHEDULER_CONFIG: SchedulerConfig = {
    bucketFloorB: 500,
    bucketFloorC: 3000,
    headroomB: 0.9,
    headroomC: 0.7
};
