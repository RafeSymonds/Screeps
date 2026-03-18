import { AttackPlan } from "plans/definitions/AttackPlan";
import { BasePlan } from "plans/definitions/BasePlan";
import { ReservationPlan } from "plans/definitions/ReservationPlan";
import { DefensePlan } from "plans/definitions/DefensePlan";
import { EconomyPlan } from "plans/definitions/EconomyPlan";
import { ExpansionPlan } from "plans/definitions/ExpansionPlan";
import { GrowthPlan } from "plans/definitions/GrowthPlan";
import { InfrastructurePlan } from "plans/definitions/InfrastructurePlan";
import { LinkPlan } from "plans/definitions/LinkPlan";
import { RemoteMiningPlan } from "plans/definitions/RemoteMiningPlan";
import { ScoutingPlan } from "plans/definitions/ScoutingPlan";
import { SupportPlan } from "plans/definitions/SupportPlan";
import { TerminalPlan } from "plans/definitions/TerminalPlan";
import { MaintenancePlan } from "plans/definitions/MaintenancePlan";
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
        { key: "maintenance", interval: 10, priority: "important", plan: new MaintenancePlan() },
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
