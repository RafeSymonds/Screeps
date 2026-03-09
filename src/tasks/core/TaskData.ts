import { TaskKind } from "./TaskKind";

export enum TaskSafetyPolicy {
    NORMAL = "normal",
    ALLOW_DANGEROUS_ASSIGNMENT = "allowDangerousAssignment"
}

export type BaseTask = {
    id: string;
    targetRoom: string;
    assignedCreeps: [Id<Creep>, string][];
    safetyPolicy?: TaskSafetyPolicy;
};

export type BuildTaskData = BaseTask & {
    kind: TaskKind.BUILD;
    constructionId: Id<ConstructionSite>;
};

export type UpgradeTaskData = BaseTask & {
    kind: TaskKind.UPGRADE;
    controllerId: Id<StructureController>;
};

export type HarvestTaskData = BaseTask & {
    kind: TaskKind.HARVEST;
    targetId: Id<Source>;
    maxSpots: number;
};

export type RemoteHarvestTaskData = BaseTask & {
    kind: TaskKind.REMOTE_HARVEST;
    targetId: Id<Source>;
    sourcePos: RoomPosition;
    ownerRoom: string;
};

export type RemoteHaulTaskData = BaseTask & {
    kind: TaskKind.REMOTE_HAUL;
};

export type DeliverTaskTargetData =
    | {
          kind: "structure";
          structureId: Id<AnyStoreStructure>;
      }
    | {
          kind: "position";
          position: RoomPosition;
      };

export type DeliverTaskData = BaseTask & {
    kind: TaskKind.DELIVER;
    target: DeliverTaskTargetData;
};

export type ScoutTaskData = BaseTask & {
    kind: TaskKind.SCOUT;
};

export type TaskData =
    | BuildTaskData
    | UpgradeTaskData
    | HarvestTaskData
    | RemoteHarvestTaskData
    | RemoteHaulTaskData
    | DeliverTaskData
    | ScoutTaskData;

export type RoomTaskData = {
    name: string;
    tasks: TaskData[];
};
