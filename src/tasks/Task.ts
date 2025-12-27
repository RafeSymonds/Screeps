export abstract class Task {
    public abstract isStillValid(): boolean;
}

export function getTasks(): Map<string, Task> {
    return new Map<string, Task>();
}
