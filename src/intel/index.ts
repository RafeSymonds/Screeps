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
import { log } from "telemetry/index";
import { ReachMap, reach } from "intel/reach";

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
    scoutPriority: 40,
    /** How many room transitions from home a scout will walk. Deliberately
     *  further than remotes will mine (REMOTES_CONFIG.maxDepth): knowledge is
     *  cheap — a [MOVE] scout costs 50 energy and carries no fatigue on any
     *  terrain — while the decisions it feeds (which neighbour to adopt, where to
     *  expand) are only as good as the map they can see. Scouting exactly as far
     *  as we mine means never learning about anything better. */
    scoutDepth: 3,
    /** Give up on a target a scout has failed to reach in this many ticks.
     *  Generous on purpose: crossing three rooms is ~200 ticks, and a scout
     *  delayed by traffic or parked by movement's unreachable-goal cool-off
     *  deserves to finish rather than be abandoned mid-walk. */
    scoutPatience: 400
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

/**
 * Heap caches for the exit graph. The map's topology never changes, so these are
 * computed once per global and reused — a global reset simply pays for them
 * again, which is a few `describeExits` calls.
 *
 * `undefined` means "the map would not tell us this room's exits", which is NOT
 * the same as "this room does not exist" — see reach.ts. It is cached too, since
 * re-asking every pass is how a cheap check becomes a per-tick scan, and the one
 * thing that can change the answer (the engine's map grid growing as terrain is
 * shipped) also happens across the global reset that clears this cache.
 */
const exitsCache = new Map<string, string[] | undefined>();
const reachCache = new Map<string, ReachMap>();

/**
 * Rooms a scout was sent to and never arrived at, and the walk clock that decides
 * it. This is the honest form of the question "can we actually get there?" — asked
 * by trying, rather than by consulting `describeExits`, which answers null for
 * every real room we have not visited yet (see reach.ts) and would therefore
 * blind us to precisely what we are trying to discover.
 *
 * Heap-only, so a global reset re-earns it. That is the right lifetime: the reason
 * a room was unreachable may have been transient (a wall of creeps, a movement
 * cool-off), and re-trying it every few hundred ticks costs one scout's walk.
 */
const unreachable = new Set<string>();
const scoutWalks = new Map<string, { room: string; since: number }>();

function exitsOf(roomName: string): string[] | undefined {
    if (exitsCache.has(roomName)) {
        return exitsCache.get(roomName);
    }
    const exits = Game.map.describeExits(roomName);
    const names = exits ? Object.values(exits).filter((n): n is string => typeof n === "string") : undefined;
    exitsCache.set(roomName, names);
    return names;
}

/**
 * Every room within `maxDepth` border crossings of `origin`, with its depth.
 *
 * Source-keeper rooms are excluded outright rather than merely avoided as
 * targets: their guards are permanent, respawning, and lethal to anything we can
 * afford at this stage, so a route THROUGH one is as fatal as a stay in one.
 * Every consumer — scouting, remote adoption, path routing — is entitled to
 * assume this graph is walkable.
 */
export function reachableRooms(origin: string, maxDepth: number): ReachMap {
    const key = `${origin}:${maxDepth}`;
    const cached = reachCache.get(key);
    if (cached) {
        return cached;
    }
    const result = reach({
        origin,
        maxDepth,
        exitsOf,
        blocked: name => roomType(name) === RoomType.SourceKeeper
    });
    // An incomplete graph means the map would not answer — usually the origin
    // itself. Serve it, but do not enshrine it: caching a truncated graph would
    // permanently blind this home to everything past the gap.
    if (result.complete) {
        reachCache.set(key, result.rooms);
    }
    return result.rooms;
}

/** Wipes the heap caches (exit graph + scout-reachability). Tests only —
 *  production relies on a global reset doing exactly this for free. */
export function _clearReachCacheForTest(): void {
    exitsCache.clear();
    reachCache.clear();
    unreachable.clear();
    scoutWalks.clear();
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

    // 3. Scout rotation: one scout per home; the whole neighbourhood out to
    //    `scoutDepth`, not just the four rooms next door.
    for (const home of ctx.snapshot.myRooms) {
        const scout = ctx.snapshot.myCreeps.find(
            c =>
                (c.memory as { owner?: SubsystemId; home?: string }).owner === SubsystemId.Intel &&
                (c.memory as { home?: string }).home === home.name
        );
        const current = scout ? (scout.memory as { assignment?: { room?: string } }).assignment?.room : undefined;
        // "Not there yet" — the condition that keeps a scout walking rather than
        // being redirected every pass (record-then-retarget).
        const currentStale =
            current !== undefined && now - (mem.rooms[current]?.lastSeen ?? -Infinity) > INTEL_CONFIG.restaleTicks;

        // The walk clock, resolved BEFORE targets are chosen so that a room ruled
        // unreachable this pass is excluded from the list this pass — otherwise it
        // is still top of the list and the scout is immediately re-sent at it.
        let giveUp = false;
        if (scout && current !== undefined && currentStale) {
            const walk = scoutWalks.get(scout.name);
            if (!walk || walk.room !== current) {
                scoutWalks.set(scout.name, { room: current, since: now });
            } else if (now - walk.since > INTEL_CONFIG.scoutPatience) {
                unreachable.add(current);
                scoutWalks.delete(scout.name);
                giveUp = true;
                log.info(SubsystemId.Intel, () => `${home.name}: scout cannot reach ${current}, skipping it`);
            }
        } else if (scout) {
            scoutWalks.delete(scout.name);
        }

        const targets = [...reachableRooms(home.name, INTEL_CONFIG.scoutDepth)]
            .filter(([name, depth]) => {
                if (depth === 0) {
                    return false; // home; we can see it
                }
                const type = roomType(name);
                return type === RoomType.Normal || type === RoomType.Center;
            })
            .map(([name, depth]) => ({
                name,
                depth,
                // `seen` is a separate flag rather than a sentinel lastSeen: the
                // obvious -Infinity encoding both made the comparator return NaN
                // when two unseen rooms met (undefined sort order, harmless at
                // four candidates and not at twenty) and, with any finite
                // sentinel, hid unseen rooms entirely for the first
                // `restaleTicks` of the game — `now - 0 > 5000` is false at tick
                // 100, which is precisely when scouting matters most.
                seen: mem.rooms[name] !== undefined,
                lastSeen: mem.rooms[name]?.lastSeen ?? 0
            }))
            .filter(t => !t.seen || now - t.lastSeen > INTEL_CONFIG.restaleTicks)
            // A room a scout demonstrably could not walk to is not a target, or
            // the rotation parks on it forever: an unreached room stays unseen,
            // an unseen room stays top of the list, and the scout keeps being
            // sent at a wall. Cleared by a global reset, so it is re-tried.
            .filter(t => !unreachable.has(t.name))
            // Unseen before stale, and among unseen the nearest first: a room we
            // know nothing about could be the next remote, and the nearer it is
            // the likelier that is. Among rooms we HAVE seen, stalest-first —
            // otherwise the far ring would never be refreshed at all.
            .sort(
                (a, b) =>
                    Number(a.seen) - Number(b.seen) ||
                    a.lastSeen - b.lastSeen ||
                    a.depth - b.depth ||
                    (a.name < b.name ? -1 : 1)
            );
        if (targets.length === 0) {
            continue;
        }
        if (scout) {
            // Record-then-retarget: refresh (step 1) already ran this pass, so a
            // scout sitting in a just-recorded room may be retargeted NOW. A scout
            // still walking to an unrecorded room is left alone — unless the walk
            // clock above has just declared that room a lost cause.
            if ((giveUp || !currentStale) && current !== targets[0].name) {
                const live = Game.creeps[scout.name];
                if (live) {
                    live.memory.assignment = { kind: AssignmentKind.Scout, room: targets[0].name };
                    scoutWalks.set(scout.name, { room: targets[0].name, since: now });
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
