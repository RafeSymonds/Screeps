import { AnyTask } from "../definitions/Task";
import { TaskData } from "./TaskData";
import { createTask } from "./TaskCreation";
import { filterMapToArray } from "utils/MapUtils";
import { roomCanConsiderTask } from "./TaskDistributor";

type TaskMap = Map<string, AnyTask>;

export class TaskManager {
    tasks: TaskMap;

    constructor() {
        this.tasks = new Map();

        for (const taskData of Memory.tasks) {
            const task = createTask(taskData);

            if (task) {
                this.tasks.set(taskData.id, task);
            }
        }
    }

    /*
     * Adds task to task set if not already a task
     * */
    public add(taskData: TaskData) {
        const existingTask = this.tasks.get(taskData.id);

        if (existingTask) {
            existingTask.update(taskData);
            return;
        }

        const task = createTask(taskData);

        if (task) {
            task.validCreationSetup();
            this.tasks.set(taskData.id, task);
        }
    }

    public get(taskId: string): AnyTask | undefined {
        return this.tasks.get(taskId);
    }

    public pruneInvalid(): void {
        for (const [taskId, task] of this.tasks) {
            if (!task.isStillValid()) {
                this.tasks.delete(taskId);
            }
        }
    }

    public getTasksForRoom(room: Room): AnyTask[] {
        return filterMapToArray(this.tasks, task => roomCanConsiderTask(room, task));
    }
}
