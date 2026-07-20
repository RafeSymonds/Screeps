/**
 * THE normative tick order (architecture §3) as data. Grows per milestone;
 * changing the order is an architecture change and updates architecture.md.
 */
import { ScheduledEntry } from "shared/scheduling";
import { CpuClass, SubsystemId } from "shared/subsystems";
import { TELEMETRY_CONFIG } from "telemetry/config";
import { flush } from "telemetry/index";

export const ENTRIES: ScheduledEntry[] = [
    {
        id: SubsystemId.TelemetryFlush,
        cpuClass: CpuClass.C,
        interval: TELEMETRY_CONFIG.FLUSH_INTERVAL,
        phase: 0,
        run: () => flush()
    }
];
