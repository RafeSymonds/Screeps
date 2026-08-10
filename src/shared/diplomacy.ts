/**
 * Diplomacy config — the §7 seam 6 whitelist, consumed by defense's assessment
 * and tower targeting. Default stance: everyone is hostile.
 */
export interface DiplomacyConfig {
    allies: string[];
}

export const DIPLOMACY_CONFIG: DiplomacyConfig = {
    allies: []
};
