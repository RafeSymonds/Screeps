import { moveTo, moveToRoom } from "actions/primitives";
import { World } from "world/World";

/**
 * Imperative command for a reserver (controller tag `remote-reserve:<room>`). It
 * travels to its target remote and reserves the controller, holding the source
 * output at 10 e/tick (vs 5 unreserved). The empire only keeps a reserver alive
 * while the reservation is low, so this just drives it to the controller and acts;
 * the body (1–2 CLAIM) determines how fast the reservation builds.
 */
export function commandReserver(creep: Creep, _world: World): void {
    const target = creep.memory.targetRoom;
    if (!target) {
        return;
    }
    if (creep.room.name !== target) {
        moveToRoom(creep, target);
        return;
    }
    const controller = creep.room.controller;
    if (!controller) {
        return;
    }
    if (creep.reserveController(controller) === ERR_NOT_IN_RANGE) {
        moveTo(creep, controller, 1);
    }
}
