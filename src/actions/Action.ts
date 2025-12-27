import { CreepState } from "creeps/CreepState";

export abstract class Action {
    public abstract perform(creepState: CreepState): void;
}
