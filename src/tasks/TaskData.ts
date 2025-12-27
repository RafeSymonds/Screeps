import { TaskKind } from "./TaskKind";

export type BaseTask = {
    id: string;
    room: string;
    assignedAgents: Id<Creep>[];
};

export type BuildTaskData = BaseTask & {
    kind: TaskKind.BUILD;
    constructionId: Id<ConstructionSite>;
};

export type HarvestTaskData = BaseTask & {
    kind: TaskKind.HARVEST;
    targetId: Id<Source>;
};

export type TaskData = BuildTaskData | HarvestTaskData;
