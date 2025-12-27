import { TaskKind } from "./TaskKind";

export type BaseTask = {
    id: string;
    room: string;
    assignedCreeps: Id<Creep>[];
};

export type BuildTaskData = BaseTask & {
    kind: TaskKind.BUILD;
    constructionId: Id<ConstructionSite>;
};

export type HarvestTaskData = BaseTask & {
    kind: TaskKind.HARVEST;
    targetId: Id<Source>;
};

export type TransferTaskData = BaseTask & {
    kind: TaskKind.TRANSFER;
    structureId: Id<AnyStoreStructure>;
};

export type TaskData = BuildTaskData | HarvestTaskData | TransferTaskData;

export type RoomTaskData = {
    name: string;
    tasks: TaskData[];
};
