// lib/booker/tags.ts
// The agent's venue tags (build list item 6). Mirrors the database rule in
// public.booker_tags_ok: at most MAX_TAGS, each 1–MAX_TAG_LENGTH characters,
// lower-case, trimmed and unique. Pure and unit-tested.

export const MAX_TAGS = 20;
export const MAX_TAG_LENGTH = 40;

/** Offered when the agent has no tags of their own yet. Any text is allowed. */
export const STARTER_TAGS = ['dance hall', 'listening room', 'all ages', '21+', 'pays door', 'guarantee', 'outdoor', 'festival', 'private events', 'repeat buyer'] as const;

/** One tag as stored: lower-case, single spaces, no commas, at most MAX_TAG_LENGTH. */
export function normalizeTag(raw: string): string {
  return raw.replace(/,/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, MAX_TAG_LENGTH).trim();
}

/**
 * Tags from the form (comma-separated text) or an array, cleaned, de-duplicated
 * and in the order first given. Does not cap the count; the schema reports
 * too many so nothing is silently dropped.
 */
export function parseTags(value: unknown): string[] {
  const parts = Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : typeof value === 'string' ? value.split(',') : [];
  const out: string[] = [];
  for (const p of parts) {
    const t = normalizeTag(p);
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/** Tags back to the form's text value. */
export function tagsToText(tags: readonly string[] | null | undefined): string {
  return (tags ?? []).join(', ');
}

/**
 * Every tag the agent uses, most used first (then A–Z), with how many venues
 * carry it. Feeds the filter chips and the form's suggestions.
 */
export function tagCounts(venues: ReadonlyArray<{ tags?: readonly string[] | null; deleted_at?: string | null }>): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of venues) {
    if (v.deleted_at) continue;
    for (const t of new Set(v.tags ?? [])) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}
