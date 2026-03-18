import { Plan } from "./Plan";
import { World } from "world/World";

/**
 * Manages link energy transfers each tick.
 *
 * Links aren't always the right choice (e.g. low-RCL rooms, rooms with
 * unusual layouts, or when haulers are sufficient), so this plan only
 * activates when links actually exist in a room.
 *
 * Source links (near sources) fire energy to the sink link (near storage).
 * The sink link is the one closest to storage or the anchor spawn.
 */
export class LinkPlan extends Plan {
    public override run(world: World): void {
        for (const [, worldRoom] of world.rooms) {
            const room = worldRoom.room;

            if (!room.controller?.my || room.controller.level < 5) {
                continue;
            }

            const links = room.find(FIND_MY_STRUCTURES).filter(
                (s): s is StructureLink => s.structureType === STRUCTURE_LINK
            );

            if (links.length < 2) {
                continue;
            }

            const sinkLink = findSinkLink(room, links);

            if (!sinkLink) {
                continue;
            }

            for (const link of links) {
                if (link.id === sinkLink.id) {
                    continue;
                }

                if (link.cooldown > 0) {
                    continue;
                }

                // Only transfer when source link has meaningful energy
                if (link.store.getUsedCapacity(RESOURCE_ENERGY) < 100) {
                    continue;
                }

                // Don't transfer if sink is nearly full
                if (sinkLink.store.getFreeCapacity(RESOURCE_ENERGY) < 50) {
                    continue;
                }

                link.transferEnergy(sinkLink);
            }
        }
    }
}

function findSinkLink(room: Room, links: StructureLink[]): StructureLink | null {
    // Sink link = the link closest to storage, or closest to first spawn
    const anchor = room.storage?.pos ?? room.find(FIND_MY_SPAWNS)[0]?.pos;

    if (!anchor) {
        return null;
    }

    let best: StructureLink | null = null;
    let bestRange = Infinity;

    for (const link of links) {
        const range = anchor.getRangeTo(link);

        if (range < bestRange) {
            bestRange = range;
            best = link;
        }
    }

    return best;
}
