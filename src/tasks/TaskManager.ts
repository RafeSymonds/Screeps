import { AnyTask } from "./Task";
import { TaskData } from "./TaskData";
import { createTask } from "./TaskCreation";

type TaskMap = Map<string, AnyTask>;

export class TaskManager {
    tasks: TaskMap;

    constructor() {
        this.tasks = new Map();

        for (const task of Memory.tasks) {
            const created = createTask(task);
            if (created) {
                this.tasks.set(task.id, created);
            }
        }
    }

    /*
     * Adds task to task set if not already a task
     * */
    public add(taskData: TaskData) {
        if (this.tasks.has(taskData.id)) {
            return;
        }

        let task = createTask(taskData);

        if (task) {
            this.tasks.set(taskData.id, task);
        }
    }
}
