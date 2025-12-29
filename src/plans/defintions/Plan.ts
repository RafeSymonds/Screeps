import { TaskManager } from "tasks/core/TaskManager";
import { World } from "world/World";

export abstract class Plan {
    public abstract run(world: World): void;
}
