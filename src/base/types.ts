/** Cached base layout decisions for a room. Re-derivable, safe to reset. */
export interface BasePlan {
    anchor?: { x: number; y: number };
    /** Road network tiles (anchor↔sources, anchor↔controller), computed once. */
    roads?: { x: number; y: number }[];
    /** Chosen storage tile (recorded for visibility; recomputed if unbuilt). */
    storagePos?: { x: number; y: number };
}
