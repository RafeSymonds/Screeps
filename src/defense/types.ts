/** Transient per-room defense state. */
export interface DefenseState {
    threat: number;
    lastHostile?: number;
    safeModeTriggered?: number;
}
