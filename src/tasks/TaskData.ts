type BaseTask = {
    id: string;
    room: string;
    assignedAgents: Id<Creep>[];
};

type BuildTask = BaseTask & {
    kind: TaskKind.BUILD;
    targetId: Id<ConstructionSite>;
};

type HarvestTask = BaseTask & {
    kind: TaskKind.HARVEST;
    targetId: Id<Source>;
};

type TaskData = BuildTask | HarvestTask;

function createBuildTask(constructionSite: ConstructionSite): BuildTask {
    return {
        id: "build-" + constructionSite.pos.roomName + "-" + constructionSite.id,
        kind: TaskKind.BUILD,
        room: constructionSite.pos.roomName,
        assignedAgents: [],
        targetId: constructionSite.id
    };
}

function createHarvestTask(source: Source): HarvestTask {
    return {
        id: "harvest" + source.id,
        kind: TaskKind.HARVEST,
        room: source.room.name,
        assignedAgents: [],
        targetId: source.id
    };
}
