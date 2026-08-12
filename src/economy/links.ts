/**
 * Link logic — geometric role derivation + the pure transfer plan (economy.md
 * "Links"). Roles come from the room view, never from layout array order
 * (incorporation scrambles order in adopted bases).
 *
 * Links teleport energy between each other for a 3% fee and a cooldown, which is
 * the only way to move energy without a creep. The economics are simple: a link
 * pair replaces the haulers that would otherwise walk that route, and the further
 * the route the better the trade. That is why the plan wires source links to the
 * controller first — it is the longest haul in most rooms.
 *
 * Roles are derived from geometry every time rather than stored. A link is "the
 * controller link" because it stands next to the controller, and that stays true
 * through plan changes, adopted bases, and links built out of order.
 */
import { Pos, RoomSnapshot, StructureView } from "shared/views";
import { chebyshev } from "creeps/actions";

const SEND_THRESHOLD = 400;

export interface LinkRoles {
    sources: StructureView[];
    controller?: StructureView;
    hub?: StructureView;
}

export function deriveLinkRoles(room: RoomSnapshot, upgradeSpot: Pos | undefined): LinkRoles {
    const links = room.structures[STRUCTURE_LINK] ?? [];
    const storage = room.structures[STRUCTURE_STORAGE]?.[0];
    const roles: LinkRoles = { sources: [] };
    for (const link of links) {
        if (room.sources.some(s => chebyshev(link.pos, s.pos) <= 2)) {
            roles.sources.push(link);
        } else if (upgradeSpot && chebyshev(link.pos, upgradeSpot) <= 2) {
            roles.controller ??= link;
        } else if (storage && chebyshev(link.pos, storage.pos) <= 2) {
            roles.hub ??= link;
        }
        // Ambiguous/orphan links are simply not transferred through.
    }
    return roles;
}

export interface LinkTransfer {
    fromId: Id<AnyStructure>;
    toId: Id<AnyStructure>;
}

/** Each ready source link sends to the controller link, else the hub. */
export function planLinkTransfers(room: RoomSnapshot, upgradeSpot: Pos | undefined): LinkTransfer[] {
    const roles = deriveLinkRoles(room, upgradeSpot);
    const transfers: LinkTransfer[] = [];
    for (const link of roles.sources) {
        const energy = link.store?.byResource[RESOURCE_ENERGY] ?? 0;
        if (energy < SEND_THRESHOLD || (link.cooldown ?? 0) > 0) {
            continue;
        }
        const target = [roles.controller, roles.hub].find(t => t && (t.store?.free ?? 0) >= SEND_THRESHOLD);
        if (target) {
            transfers.push({ fromId: link.id, toId: target.id });
        }
    }
    return transfers;
}
