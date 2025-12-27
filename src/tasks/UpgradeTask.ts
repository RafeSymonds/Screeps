import { Task } from "./Task";

export class UpgradeTask extends Task {
    public isStillValid(): boolean {
        return true;
    }
}
