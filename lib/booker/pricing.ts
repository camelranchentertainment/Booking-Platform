// lib/booker/pricing.ts
// Booking Agent subscription tiers, decided Oct 2026:
//   1–19 active bands  → $35/month
//   20–49 active bands → $45/month
//   50+ active bands   → priced through a sales conversation
// There is no cap on bands. Billing is not wired up yet; this module is the
// single place the tiers live so the UI and the future billing code agree.

export interface AgentTier {
  key: 'standard' | 'growth' | 'enterprise';
  label: string;
  /** Monthly price in US dollars, or null when priced by conversation. */
  monthlyUsd: number | null;
  minBands: number;
  /** Inclusive upper bound, or null for no upper bound. */
  maxBands: number | null;
}

export const AGENT_TIERS: readonly AgentTier[] = [
  { key: 'standard', label: 'Standard', monthlyUsd: 35, minBands: 0, maxBands: 19 },
  { key: 'growth', label: 'Growth', monthlyUsd: 45, minBands: 20, maxBands: 49 },
  { key: 'enterprise', label: 'Agency', monthlyUsd: null, minBands: 50, maxBands: null },
];

/**
 * The tier for a given number of active roster bands.
 *
 * @throws RangeError when bandCount is negative or not a whole number
 */
export function tierForBandCount(bandCount: number): AgentTier {
  if (!Number.isInteger(bandCount) || bandCount < 0) {
    throw new RangeError(`bandCount must be a non-negative whole number, got ${bandCount}`);
  }
  const tier = AGENT_TIERS.find(t => bandCount >= t.minBands && (t.maxBands === null || bandCount <= t.maxBands));
  // The tiers cover 0..∞ with no gaps, so a match always exists.
  return tier ?? AGENT_TIERS[AGENT_TIERS.length - 1];
}

/** Bands left before the next tier starts, or null on the top tier. */
export function bandsUntilNextTier(bandCount: number): number | null {
  const tier = tierForBandCount(bandCount);
  return tier.maxBands === null ? null : tier.maxBands + 1 - bandCount;
}
