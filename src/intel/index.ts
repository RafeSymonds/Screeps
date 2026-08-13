/**
 * Intel: persistent room knowledge + the scout rotation. Owner of Memory.intel.
 * Declared direct-Game surface (snapshot exposes no visible-room enumeration):
 * iterates Game.rooms for refresh and Game.map.describeExits for targeting.
 * See docs/design/intel.md.
 *
 * ## Vision is the scarce resource
 *
 * You can only see a room while you have a creep or structure in it. Every
 * decision about rooms we do NOT occupy — which neighbor to mine, where to
 * expand, whether a route is dangerous — therefore has to run on remembered data.
 * Intel is that memory: it records what was seen, when, and lets consumers judge
 * staleness for themselves via `lastSeen`.
 *
 * This is why `intel` is on the KEEP_ON_RESET list. Room slices and plans are
 * derived and rebuild themselves in a few hundred ticks; knowledge of a room we
 * currently have no creep near cannot be recomputed at all, only re-earned by
 * walking a scout back out there.
 *
 * ## Recording is opportunistic, scouting is deliberate
 *
 * Step 1 of the tick refreshes every room we can currently see, whatever the
 * reason we can see it — a hauler passing through a corridor updates intel for
 * free. Only when that leaves a neighbor stale does a 50-energy scout get
 * dispatched. Cheap knowledge first, paid knowledge second.
 *
 * ## Hostile sightings are sticky
 *
 * A room glimpsed for one tick without hostiles is not evidence they left. Recent
 * sightings survive a hostile-free glimpse, and `isUnsafe` treats an armed
 * sighting as current for `armedMemory` ticks — the failure mode being guarded
 * against is walking a fresh crew into a raid that never actually ended.
 */
import { AssignmentKind } from "shared/assignments";
import { SpawnDemand } from "shared/spawning";
import { SubsystemId } from "shared/subsystems";
import { TickContext } from "shared/tick";

export enum RoomType {
    Normal = "normal",
    SourceKeeper = "sourceKeeper",
    Highway = "highway",
    Center = "center"
}

/**
 * Classify a room from its NAME alone — no vision, no memory. Screeps lays the
 * world out on a fixed grid: coordinates divisible by 10 are highways, the 3×3
 * block around each (5,5) holds source-keeper rooms with lethal permanent
 * guards, and its centre is a portal room. Everything else is ordinary.
 *
 * Being able to rule out a room without ever seeing it is what lets expansion and
 * remotes filter candidates for free. Never stored — it is a pure function of the
 * name, so persisting it would only create something that can go stale.
 */
export function roomType(roomName: string): RoomType {
    const m = /^[WE](\d+)[NS](\d+)$/.exec(roomName);
    if (!m) {
        return RoomType.Highway; // malformed names never qualify as adoptable
    }
    const x = parseInt(m[1], 10) % 10;
    const y = parseInt(m[2], 10) % 10;
    if (x === 0 || y === 0) {
        return RoomType.Highway;
    }
    if (x === 5 && y === 5) {
        return RoomType.Center;
    }
    if (x >= 4 && x <= 6 && y >= 4 && y <= 6) {
        return RoomType.SourceKeeper;
    }
    return RoomType.Normal;
}

export interface RoomIntel {
    lastSeen: number;
    sources: number[]; // packed y*50+x
    /** Parallel to `sources` — remote Mine assignments need the real ids. */
    sourceIds?: string[];
    mineral?: { type: MineralConstant; pos: number };
    owner?: string;
    reservedBy?: string;
    level?: number;
    hostiles?: { count: number; armed: number; seen: number };
    unsafeUntil?: number;
}

export interface IntelMemory {
    v: 1;
    rooms: Record<string, RoomIntel>;
}

export const INTEL_CONFIG = {
    /** Re-scout a room when its intel is older than this. */
    restaleTicks: 5000,
    /** Drop entries not seen for this long (size budget ≤ 8 KB). */
    pruneTicks: 100_000,
    /** Scouts sit after all income and before builders — a 50-energy body that
     *  unlocks whole rooms must not queue behind a 1200-energy upgrader. */
    scoutPriority: 40
};

const ARMED: BodyPartConstant[] = [ATTACK, RANGED_ATTACK, HEAL, WORK, CLAIM];

function slice(): IntelMemory {
    const mem = Memory as { intel?: IntelMemory };
    if (mem.intel?.v !== 1 || typeof mem.intel.rooms !== "object") {
        mem.intel = { v: 1, rooms: {} };
    }
    return mem.intel;
}

export function getIntel(roomName: string): RoomIntel | undefined {
    return slice().rooms[roomName];
}

export function flagUnsafe(roomName: string, untilTick: number): void {
    const entry = (slice().rooms[roomName] ??= { lastSeen: 0, sources: [], sourceIds: [] });
    entry.unsafeUntil = Math.max(entry.unsafeUntil ?? 0, untilTick);
}

/** Unsafe = explicit flag, or an armed sighting fresher than `armedMemory`. */
export function isUnsafe(roomName: string, now: number, armedMemory = 300): boolean {
    const entry = slice().rooms[roomName];
    if (!entry) {
        return false;
    }
    if ((entry.unsafeUntil ?? 0) > now) {
        return true;
    }
    return entry.hostiles !== undefined && entry.hostiles.armed > 0 && now - entry.hostiles.seen <= armedMemory;
}

/** Overwrite a room's intel from live vision. Rebuilt rather than merged so
 *  removed structures/owners disappear — except the two hostile fields, which are
 *  deliberately carried forward (see the header). */
function refreshFrom(room: Room, now: number): void {
    const found = room.find(FIND_SOURCES);
    const entry: RoomIntel = {
        lastSeen: now,
        sources: found.map(s => s.pos.y * 50 + s.pos.x),
        sourceIds: found.map(s => s.id as string)
    };
    const mineral = room.find(FIND_MINERALS)[0];
    if (mineral) {
        entry.mineral = { type: mineral.mineralType, pos: mineral.pos.y * 50 + mineral.pos.x };
    }
    if (room.controller) {
        if (room.controller.owner) {
            entry.owner = room.controller.owner.username;
        }
        if (room.controller.reservation) {
            entry.reservedBy = room.controller.reservation.username;
        }
        if (room.controller.level > 0) {
            entry.level = room.controller.level;
        }
    }
    const hostiles = room.find(FIND_HOSTILE_CREEPS);
    if (hostiles.length > 0) {
        const armed = hostiles.filter(h =>
            ARMED.some(p => h.getActiveBodyparts(p) > 0 || h.body.some(b => b.type === p))
        );
        entry.hostiles = { count: hostiles.length, armed: armed.length, seen: now };
    }
    const prev = slice().rooms[room.name];
    if (prev?.unsafeUntil !== undefined) {
        entry.unsafeUntil = prev.unsafeUntil;
    }
    if (prev?.hostiles !== undefined && entry.hostiles === undefined && now - prev.hostiles.seen <= 1000) {
        entry.hostiles = prev.hostiles; // keep a recent sighting through a hostile-free glimpse
    }
    slice().rooms[room.name] = entry;
}

/**
 * The class-C entry: refresh visible rooms, then rotate scouts.
 *
 * The order is the point. Refresh runs BEFORE retargeting, so a scout that just
 * arrived has already banked its room's intel and can be redirected on the same
 * tick — "record then retarget". Retargeting first would send it onward before
 * its observation was written, and the room would stay stale forever.
 */
export function run(ctx: TickContext): void {
    const now = ctx.snapshot.time;
    const mem = slice();

    // 1. Refresh everything we can currently see (transient vision included).
    for (const room of Object.values(Game.rooms)) {
        refreshFrom(room, now);
    }

    // 2. Prune ancient entries.
    for (const [name, entry] of Object.entries(mem.rooms)) {
        if (now - entry.lastSeen > INTEL_CONFIG.pruneTicks) {
            delete mem.rooms[name];
        }
    }

    // 3. Scout rotation: one scout per home; stalest eligible neighbor.
    for (const home of ctx.snapshot.myRooms) {
        const exits = Game.map.describeExits(home.name);
        if (!exits) {
            continue; // off the map grid (sparse sim worlds) — nothing to scout
        }
        const targets = Object.values(exits)
            .filter((n): n is string => typeof n === "string")
            .filter(n => {
                const type = roomType(n);
                return type === RoomType.Normal || type === RoomType.Center;
            })
            .map(n => ({ name: n, lastSeen: mem.rooms[n]?.lastSeen ?? -Infinity }))
            .filter(t => now - t.lastSeen > INTEL_CONFIG.restaleTicks)
            .sort((a, b) => a.lastSeen - b.lastSeen || (a.name < b.name ? -1 : 1));
        if (targets.length === 0) {
            continue;
        }
        const scout = ctx.snapshot.myCreeps.find(
            c =>
                (c.memory as { owner?: SubsystemId; home?: string }).owner === SubsystemId.Intel &&
                (c.memory as { home?: string }).home === home.name
        );
        if (scout) {
            // Record-then-retarget: refresh (step 1) already ran this pass, so a
            // scout sitting in a just-recorded room may be retargeted NOW.
            const assignment = (scout.memory as { assignment?: { room?: string } }).assignment;
            const current = assignment?.room;
            const currentStale =
                current !== undefined && now - (mem.rooms[current]?.lastSeen ?? -Infinity) > INTEL_CONFIG.restaleTicks;
            if (!currentStale && current !== targets[0].name) {
                const live = Game.creeps[scout.name];
                if (live) {
                    live.memory.assignment = { kind: AssignmentKind.Scout, room: targets[0].name };
                }
            }
            continue;
        }
        const demand: SpawnDemand = {
            id: `scout:${home.name}`,
            priority: INTEL_CONFIG.scoutPriority,
            home: home.name,
            owner: SubsystemId.Intel,
            assignment: { kind: AssignmentKind.Scout, room: targets[0].name },
            body: [MOVE]
        };
        ctx.spawnDemands.push(demand);
    }
}
