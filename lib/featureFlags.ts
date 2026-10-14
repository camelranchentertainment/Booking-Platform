/**
 * Central on/off switches for features that are built but not ready for users.
 *
 * Kept in code (not an env var) on purpose: turning a feature back on is a
 * reviewed one-line PR, and the value can't drift between Preview and Production.
 * To re-enable a feature, flip its value to `true`.
 */
export const FEATURES = {
  /**
   * Socials tab, the dashboard Socials tile, the /social page, the
   * /api/social/* routes, and the agent's social_draft action.
   * Hidden until the Socials feature is fixed.
   */
  socials: false,
} as const;

export type FeatureName = keyof typeof FEATURES;

/** True when the named feature is switched on. */
export function isFeatureEnabled(name: FeatureName): boolean {
  return FEATURES[name];
}
