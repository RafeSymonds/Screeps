export enum TaskKind {
    BUILD,
    HARVEST,
    REMOTE_HARVEST,
    REMOTE_HAUL,
    DELIVER,
    UPGRADE,
    SCOUT
}

export namespace TaskKind {
    export function isRemote(taskKind: TaskKind): boolean {
        return taskKind === TaskKind.REMOTE_HARVEST || taskKind === TaskKind.REMOTE_HAUL;
    }
}
