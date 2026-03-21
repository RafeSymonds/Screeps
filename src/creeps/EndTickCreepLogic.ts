import { CreepState } from "./CreepState";

function forceMove(creep: Creep): void {
    // 1️⃣ Edge correction (highest priority)
    if (creep.pos.x === 0) {
        creep.move(RIGHT);
        return;
    }
    if (creep.pos.x === 49) {
        creep.move(LEFT);
        return;
    }
    if (creep.pos.y === 0) {
        creep.move(BOTTOM);
        return;
    }
    if (creep.pos.y === 49) {
        creep.move(TOP);
        return;
    }
}

export function moveAtTickEnd(creepState: CreepState) {
    // Only force move if we are truly idle (no taskId and no energyTargetId)
    // AND we haven't already moved this tick.
    if (!creepState.moved && !creepState.memory.taskId && !creepState.memory.energyTargetId) {
        forceMove(creepState.creep);
    }
}
