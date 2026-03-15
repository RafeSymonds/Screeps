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
    ownerRoom?: string;
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
    routeLength: number;
};

export type RemoteHaulTaskData = BaseTask & {
    kind: TaskKind.REMOTE_HAUL;
    ownerRoom: string;
    routeLength: number;
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

export type DefendTaskData = BaseTask & {
    kind: TaskKind.DEFEND;
};

export type ClaimTaskData = BaseTask & {
    kind: TaskKind.CLAIM;
    ownerRoom: string;
};

export type AttackTaskData = BaseTask & {
    kind: TaskKind.ATTACK;
    ownerRoom: string;
    squadSize: number;
};

export type ReserveTaskData = BaseTask & {
    kind: TaskKind.RESERVE;
    ownerRoom: string;
};

export type BootstrapTaskData = BaseTask & {
    kind: TaskKind.BOOTSTRAP;
    ownerRoom: string;
};

export type TaskData =
    | BuildTaskData
    | UpgradeTaskData
    | HarvestTaskData
    | RemoteHarvestTaskData
    | RemoteHaulTaskData
    | DeliverTaskData
    | ScoutTaskData
    | DefendTaskData
    | ClaimTaskData
    | AttackTaskData
    | ReserveTaskData
    | BootstrapTaskData;

export type RoomTaskData = {
    name: string;
    tasks: TaskData[];
};
