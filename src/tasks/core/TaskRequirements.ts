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
    combat?: RequirementSpec; // ATTACK/RANGED_ATTACK/HEAL parts worth of throughput
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
    if (spec === undefined) {
        return 0;
    }

    if (typeof spec === "number") {
        return spec > 0 ? 1 : 0;
    }

    return spec.creeps ?? (spec.parts && spec.parts > 0 ? 1 : 0);
}
