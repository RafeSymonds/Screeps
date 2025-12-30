export type RequirementSpec =
    | number
    | {
          parts?: number;
          creeps?: number;
      };

export interface TaskRequirements {
    mine?: RequirementSpec; // WORK parts worth of throughput for mining only
    work?: RequirementSpec; // WORK parts worth of throughput
    carry?: RequirementSpec; // CARRY parts worth of throughput
    move?: RequirementSpec; // MOVE pressure (optional, advanced)
    vision?: boolean; // needs presence in room
}

export function requirementParts(spec?: RequirementSpec): number {
    if (spec === undefined) {
        return 0;
    }

    if (typeof spec === "number") {
        return spec;
    }

    return spec.parts ?? 0;
}

export function requirementCreeps(spec?: RequirementSpec): number {
    if (spec === undefined || typeof spec === "number") {
        return 0;
    }

    return spec.creeps ?? 0;
}
