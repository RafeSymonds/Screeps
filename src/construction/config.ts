/**
 * Construction tunables — one named config. See docs/design/construction.md.
 */
export interface ConstructionConfig {
    /** One site being finished plus one staged; builders never spread further. */
    maxOpenSites: number;
    /** Never remove an off-plan site at or above this build-progress fraction. */
    keepProgressFraction: number;
}

export const CONSTRUCTION_CONFIG: ConstructionConfig = {
    maxOpenSites: 2,
    keepProgressFraction: 0.5
};
