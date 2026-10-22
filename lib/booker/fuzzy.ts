// lib/booker/fuzzy.ts
// Typo-tolerant search for the agent workspace (build list item 6). Pure, no
// I/O, unit-tested.
//
// How a query matches a record:
//   • Text is normalised: accents removed ("Café" → "cafe"), "&" read as "and",
//     apostrophes dropped ("Billy Bob's" → "billy bobs"), other punctuation
//     treated as spaces, all lower-case.
//   • Every word of the query must match something in the record (AND), so
//     "gruene tx" narrows rather than widens.
//   • A query word matches a record word exactly (best), as the start of it
//     ("gru" → "gruene"), inside the record text ("bob" → "billybobs"), or
//     within a small number of typos: 1 for words of 4–7 letters, 2 for 8+
//     (a swapped pair of letters counts as one). Words of 3 letters or fewer
//     must match exactly or as a prefix, so "tx" never matches "ty".
//     A mistyped START of a longer word only counts for query words of 5+
//     letters ("braunf" → "braunfels", but "hall" never → "ballroom").
//   • Results are ranked by how well they matched; ties keep the input order.
//
// Build the index once per data load (useMemo) and query it on each keystroke.

/** Lower-case, accent-free, punctuation-free text with single spaces. */
export function normalizeText(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** Typos allowed for a query word of this length. */
export function typoLimit(length: number): number {
  if (length <= 3) return 0;
  if (length <= 7) return 1;
  return 2;
}

/**
 * Optimal-string-alignment distance (Levenshtein plus adjacent swaps), giving
 * up early: returns `max + 1` as soon as the distance must exceed `max`.
 */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  if (a === b) return 0;
  let prevPrev: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prevPrev[j - 2] + 1);
      cur.push(v);
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prevPrev = prev;
    prev = cur;
  }
  return prev[b.length];
}

/** Shortest query word that may match the mistyped start of a longer word. */
const PREFIX_TYPO_MIN = 5;

/** Scores for one query word against one record; 0 means no match. */
const SCORE = { exact: 4, prefix: 3, inside: 2, typo: 1 } as const;

interface IndexedRecord<T> {
  item: T;
  words: string[];
  /** All the record's text with no spaces, for "billybobs" vs "billy bobs" */
  compact: string;
}

export interface SearchIndex<T> {
  records: IndexedRecord<T>[];
}

/**
 * Prepares records for searching.
 *
 * @param fields the text to search for each record; null/undefined are skipped
 */
export function buildIndex<T>(items: readonly T[], fields: (item: T) => ReadonlyArray<string | null | undefined>): SearchIndex<T> {
  return {
    records: items.map(item => {
      const text = normalizeText(fields(item).filter((f): f is string => typeof f === 'string' && f !== '').join(' '));
      const words = text ? Array.from(new Set(text.split(' '))) : [];
      return { item, words, compact: words.join('') };
    }),
  };
}

function wordScore(q: string, record: IndexedRecord<unknown>): number {
  const limit = typoLimit(q.length);
  let best = 0;
  for (const w of record.words) {
    if (w === q) return SCORE.exact;
    if (w.startsWith(q)) best = Math.max(best, SCORE.prefix);
    else if (best < SCORE.typo && limit > 0) {
      // Compare with the whole word, and (for words of 5+ letters) with its
      // start, so a half-typed, mistyped word still finds it ("braunf" →
      // "braunfels"). Short words skip the start check: "hall" must not
      // match "ballroom" through "ball".
      if (editDistance(q, w, limit) <= limit || (q.length >= PREFIX_TYPO_MIN && w.length > q.length && editDistance(q, w.slice(0, q.length), limit) <= limit)) best = SCORE.typo;
    }
  }
  if (best < SCORE.inside && q.length >= 3 && record.compact.includes(q)) best = SCORE.inside;
  return best;
}

/**
 * Records matching every word of the query, best match first. A blank query
 * returns every record in its original order.
 */
export function searchIndex<T>(index: SearchIndex<T>, query: string): T[] {
  const terms = normalizeText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return index.records.map(r => r.item);
  const hits: { item: T; score: number; order: number }[] = [];
  index.records.forEach((record, order) => {
    let score = 0;
    for (const t of terms) {
      const s = wordScore(t, record);
      if (s === 0) return;
      score += s;
    }
    hits.push({ item: record.item, score, order });
  });
  return hits.sort((a, b) => b.score - a.score || a.order - b.order).map(h => h.item);
}

/** One-off search without keeping an index (small lists only). */
export function fuzzyFilter<T>(items: readonly T[], query: string, fields: (item: T) => ReadonlyArray<string | null | undefined>): T[] {
  return searchIndex(buildIndex(items, fields), query);
}
