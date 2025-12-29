import { TaskKind } from "./TaskKind";

export type BaseTask = {
    id: string;
    room: string;
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
    maxSpots: number;
};

export type TransferTaskData = BaseTask & {
    kind: TaskKind.TRANSFER;
    structureId: Id<AnyStoreStructure>;
};

export type TaskData = BuildTaskData | UpgradeTaskData | HarvestTaskData | RemoteHarvestTaskData | TransferTaskData;

export type RoomTaskData = {
    name: string;
    tasks: TaskData[];
};
