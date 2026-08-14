/**
 * Construction tunables — one named config. See docs/design/construction.md.
 */
export interface ConstructionConfig {
    /** One site being finished plus one staged; builders never spread further. */
    maxOpenSites: number;
    /** Separate, larger budget for maintenance types (roads, ramparts, walls).
     *
     *  A road is worth nothing until the whole path exists, and one site at a time
     *  builds it end-to-end at walking pace — field-reported as "it seemed to do 1
     *  piece of road at a time to a source". Opening the path lets the maintenance
     *  worker build whichever piece it is standing next to instead of commuting to
     *  a designated one.
     *
     *  It is a separate budget rather than a bigger shared one because roads
     *  REGENERATE — 2500 are legal at every RCL — and unbounded regenerating work
     *  at the top of a ladder starves everything under it (economy.md). Maintenance
     *  keeps its one seat; this only changes how many pieces that seat can choose
     *  between. */
    maxOpenMaintenanceSites: number;
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
    maxOpenMaintenanceSites: 6,
    keepProgressFraction: 0.5,
    minRcl: {
        // Ramparts/walls decay forever and are pure insurance. They are also the
        // only structure whose upkeep never ends, so every tick of builder time
        // spent on them early is taken from the extensions that make everything
        // else affordable — and a room below RCL6 has little worth besieging and
        // towers enough to handle what does show up. RCL4 was still too early in
        // the field; 6 is where the room is worth the insurance.
        [STRUCTURE_RAMPART]: 6,
        [STRUCTURE_WALL]: 6
    }
};
