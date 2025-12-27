import { Action } from "actions/Action";

export class CreepController {
    private readonly actions: Action[] = [];

    public addAction(action: Action): void {
        this.actions.push(action);
    }

    public run(creep: Creep): void {
        for (const action of this.actions) {
            action.perform(creep);
        }
    }
}
