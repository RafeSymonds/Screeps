import { TaskKind } from "./TaskKind";

export type BaseTask = {
    id: string;
    targetRoom: string;
    assignedCreeps: [Id<Creep>, string][];
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

export type DeliverTaskData = BaseTask & {
    kind: TaskKind.DELIVER;
    structureId: Id<AnyStoreStructure>;
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
