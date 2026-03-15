import { AttackPlan } from "plans/defintions/AttackPlan";
import { BasePlan } from "plans/defintions/BasePlan";
import { ReservationPlan } from "plans/defintions/ReservationPlan";
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
import { computeThrottleTier, PlanPriority } from "cpu/CpuBudget";

export function runPlans(world: World) {
    const tier = computeThrottleTier();

    const plans: { key: string; interval: number; priority: PlanPriority; plan: { run(world: World): void } }[] = [
        { key: "defense", interval: 1, priority: "critical", plan: new DefensePlan() },
        { key: "economy", interval: 1, priority: "critical", plan: new EconomyPlan() },
        { key: "link", interval: 1, priority: "critical", plan: new LinkPlan() },
        { key: "growth", interval: 25, priority: "important", plan: new GrowthPlan() },
        { key: "support", interval: 10, priority: "important", plan: new SupportPlan() },
        { key: "infrastructure", interval: 25, priority: "important", plan: new InfrastructurePlan() },
        { key: "base", interval: 50, priority: "optional", plan: new BasePlan() },
        { key: "remoteMining", interval: 10, priority: "important", plan: new RemoteMiningPlan() },
        { key: "scouting", interval: 15, priority: "optional", plan: new ScoutingPlan() },
        { key: "expansion", interval: 50, priority: "optional", plan: new ExpansionPlan() },
        { key: "terminal", interval: 15, priority: "important", plan: new TerminalPlan() },
        { key: "reservation", interval: 20, priority: "important", plan: new ReservationPlan() },
        { key: "attack", interval: 25, priority: "optional", plan: new AttackPlan() }
    ];

    for (const { key, interval, priority, plan } of plans) {
        if (!shouldRunPlan(key, interval, tier, priority)) {
            continue;
        }

        plan.run(world);
    }
}
