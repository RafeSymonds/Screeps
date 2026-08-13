/**
 * Construction tunables — one named config. See docs/design/construction.md.
 */
export interface ConstructionConfig {
    /** One site being finished plus one staged; builders never spread further. */
    maxOpenSites: number;
    /** Never remove an off-plan site at or above this build-progress fraction. */
    keepProgressFraction: number;
    /** RCL floor per structure type — nothing of that type is placed below it,
     *  even where CONTROLLER_STRUCTURES already allows it. This is about build
     *  ORDER, not legality: the engine permits ramparts from RCL2, but spending a
     *  young room's only builders on defenses it does not yet need starves the
     *  extensions that make everything else affordable. */
    minRcl: Partial<Record<BuildableStructureConstant, number>>;
}

export const CONSTRUCTION_CONFIG: ConstructionConfig = {
    maxOpenSites: 2,
    keepProgressFraction: 0.5,
    minRcl: {
        // Ramparts/walls decay forever and are pure insurance. Before a room has
        // towers (RCL3) and something worth defending, they are a permanent drain
        // on exactly the labor that should be building economy.
        [STRUCTURE_RAMPART]: 4,
        [STRUCTURE_WALL]: 4
    }
};
