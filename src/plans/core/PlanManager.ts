import { BasePlan } from "plans/defintions/BasePlan";
import { EconomyPlan } from "plans/defintions/EconomyPlan";
import { RemoteMiningPlan } from "plans/defintions/RemoteMiningPlan";
import { ScoutingPlan } from "plans/defintions/ScoutingPlan";
import { World } from "world/World";

export function runPlans(world: World) {
    const plans = [new EconomyPlan(), new BasePlan(), new RemoteMiningPlan(), new ScoutingPlan()];

    for (const plan of plans) {
        plan.run(world);
    }
}
