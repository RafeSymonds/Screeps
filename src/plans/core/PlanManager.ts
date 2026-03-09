import { BasePlan } from "plans/defintions/BasePlan";
import { EconomyPlan } from "plans/defintions/EconomyPlan";
import { GrowthPlan } from "plans/defintions/GrowthPlan";
import { RemoteMiningPlan } from "plans/defintions/RemoteMiningPlan";
import { ScoutingPlan } from "plans/defintions/ScoutingPlan";
import { shouldRunPlan } from "./PlanScheduler";
import { World } from "world/World";

export function runPlans(world: World) {
    const plans = [
        { key: "economy", interval: 1, plan: new EconomyPlan() },
        { key: "growth", interval: 25, plan: new GrowthPlan() },
        { key: "base", interval: 50, plan: new BasePlan() },
        { key: "remoteMining", interval: 10, plan: new RemoteMiningPlan() },
        { key: "scouting", interval: 15, plan: new ScoutingPlan() }
    ];

    for (const { key, interval, plan } of plans) {
        if (!shouldRunPlan(key, interval)) {
            continue;
        }

        plan.run(world);
    }
}
