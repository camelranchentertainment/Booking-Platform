// Shared in-memory job state — imported by both enrich-emails and enrich-status routes.
// Works reliably in dev / single-process deployments.

export interface EnrichmentState {
  running: boolean;
  totalMissing: number; // snapshot at job start
  processed: number;    // venues attempted so far
  found: number;        // emails successfully found and saved
  currentVenue: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
}

export const enrichmentState: EnrichmentState = {
  running: false,
  totalMissing: 0,
  processed: 0,
  found: 0,
  currentVenue: null,
  startedAt: null,
  finishedAt: null,
  error: null,
};
