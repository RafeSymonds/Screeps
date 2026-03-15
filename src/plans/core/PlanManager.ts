import { BasePlan } from "plans/defintions/BasePlan";
import { DefensePlan } from "plans/defintions/DefensePlan";
import { EconomyPlan } from "plans/defintions/EconomyPlan";
import { ExpansionPlan } from "plans/defintions/ExpansionPlan";
import { GrowthPlan } from "plans/defintions/GrowthPlan";
import { InfrastructurePlan } from "plans/defintions/InfrastructurePlan";
import { LinkPlan } from "plans/defintions/LinkPlan";
import { RemoteMiningPlan } from "plans/defintions/RemoteMiningPlan";
import { ScoutingPlan } from "plans/defintions/ScoutingPlan";
import { SupportPlan } from "plans/defintions/SupportPlan";
import { TerminalPlan } from "plans/defintions/TerminalPlan";
import { shouldRunPlan } from "./PlanScheduler";
import { World } from "world/World";

export function runPlans(world: World) {
    const plans = [
        { key: "defense", interval: 1, plan: new DefensePlan() },
        { key: "economy", interval: 1, plan: new EconomyPlan() },
        { key: "link", interval: 1, plan: new LinkPlan() },
        { key: "growth", interval: 25, plan: new GrowthPlan() },
        { key: "support", interval: 10, plan: new SupportPlan() },
        { key: "infrastructure", interval: 25, plan: new InfrastructurePlan() },
        { key: "base", interval: 50, plan: new BasePlan() },
        { key: "remoteMining", interval: 10, plan: new RemoteMiningPlan() },
        { key: "scouting", interval: 15, plan: new ScoutingPlan() },
        { key: "expansion", interval: 50, plan: new ExpansionPlan() },
        { key: "terminal", interval: 15, plan: new TerminalPlan() }
    ];

    for (const { key, interval, plan } of plans) {
        if (!shouldRunPlan(key, interval)) {
            continue;
        }

        plan.run(world);
    }
}
