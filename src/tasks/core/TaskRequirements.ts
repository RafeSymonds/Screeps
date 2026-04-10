export type RequirementSpec =
    | number
    | {
          parts?: number;
          creeps?: number;
      };

export interface LaborDemand {
    mine?: RequirementSpec;
    work?: RequirementSpec;
    carry?: RequirementSpec;
    combat?: RequirementSpec;
    move?: RequirementSpec;
    vision?: boolean;
}

export type TaskRequirements = LaborDemand;

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
