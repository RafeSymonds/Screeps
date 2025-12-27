import { AnyTask } from "./Task";
import { TaskData } from "./TaskData";
import { createTask } from "./TaskCreation";

type TaskMap = Map<string, AnyTask>;

export class TaskManager {
    tasks: TaskMap;

    constructor() {
        this.tasks = new Map(Memory.tasks.map(task => [task.id, createTask(task)]));
    }

    /*
     * Adds task to task set if not already a task
     * */
    public add(taskData: TaskData) {
        if (this.tasks.has(taskData.id)) {
            return;
        }

        this.tasks.set(taskData.id, createTask(taskData));
    }
}
