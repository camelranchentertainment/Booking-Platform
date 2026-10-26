// lib/server/importExtract.ts
//
// AI extraction for the import wizard (/api/import/parse), used for PDFs and
// for spreadsheets whose columns can't be matched by header.
//
// The old route sent the first 12,000 characters in one request capped at
// 4,000 output tokens. A real venue list overflowed both: rows past 12,000
// characters were silently dropped, and when the JSON answer ran past 4,000
// tokens it was cut off mid-object, failed to parse, and the user saw "AI could
// not structure the document". Here the text is split into chunks on line
// boundaries, each chunk is extracted separately (a few at a time), a chunk
// whose answer is cut off is split in half and retried, and every limit that
// drops data is reported back as a warning instead of happening silently.

export type ImportKind = 'venues' | 'shows';

// Sized for the route's 60-second limit: a chunk of ~35 rows answers in well
// under 30 seconds, and five run at once.
/** Characters of document text per model call. */
export const CHUNK_CHARS = 3_500;
/** Most chunks read from one file (about 52,000 characters, roughly 500 rows). */
export const MAX_CHUNKS = 15;
/** Chunks extracted at the same time. */
const CHUNK_CONCURRENCY = 5;
/** Output budget per call; a full chunk of rows fits with room to spare. */
const CHUNK_MAX_TOKENS = 4_000;
/** No new chunk starts after this long, so the request finishes inside 60 s. */
export const TIME_BUDGET_MS = 45_000;

export interface ModelReply {
  text: string;
  /** True when the model stopped because it ran out of output tokens. */
  truncated: boolean;
}

/** Calls the model with one prompt. Injected so tests run without the API. */
export type CallModel = (prompt: string, maxTokens: number) => Promise<ModelReply>;

export interface ExtractResult {
  records: Record<string, unknown>[];
  warnings: string[];
}

const VENUE_PROMPT = (content: string) => `You are a data extraction assistant. Extract venue information from the following document and return it as JSON.

Document content:
${content}

Return ONLY a JSON object with this exact structure, no other text:
{
  "venues": [
    {
      "name": "venue name (required)",
      "city": "city or null",
      "state": "2-letter state code or null",
      "email": "email address or null",
      "phone": "phone number or null",
      "booking_contact": "contact person name or null",
      "website": "website URL or null",
      "capacity": "number or null",
      "notes": "any other relevant notes or null"
    }
  ],
  "warnings": []
}

Rules:
- Extract every venue in this part of the document, regardless of column names or format
- This may be one part of a longer document; a row cut off at the very start or end can be skipped
- If a field is not present leave it as null
- Normalize state to 2-letter code (Missouri = MO, Texas = TX etc)
- Do not invent data that is not in the document`;

const SHOW_PROMPT = (content: string) => `You are a data extraction assistant. Extract show/booking information from the following document and return it as JSON.

Document content:
${content}

Return ONLY a JSON object with this exact structure, no other text:
{
  "shows": [
    {
      "show_date": "YYYY-MM-DD format (required)",
      "venue_name": "venue name or null",
      "city": "city or null",
      "state": "2-letter state code or null",
      "fee": "numeric amount only, no $ sign, or null",
      "deal_type": "flat_fee or door_split or percentage or tips or free or null",
      "set_time": "HH:MM format or null",
      "notes": "any other relevant info or null",
      "status": "confirmed or pending or cancelled"
    }
  ],
  "warnings": []
}

Rules:
- Extract every show in this part of the document, regardless of column names or format
- This may be one part of a longer document; a row cut off at the very start or end can be skipped
- Dates must be in YYYY-MM-DD format
- If date format is ambiguous use MM/DD/YYYY interpretation
- Normalize state to 2-letter code
- Fee should be numeric only — strip $, commas etc
- If status is unclear assume confirmed
- Do not invent data that is not in the document`;

const promptFor = (kind: ImportKind, content: string): string =>
  kind === 'venues' ? VENUE_PROMPT(content) : SHOW_PROMPT(content);

/**
 * Splits text into chunks of at most `size` characters, breaking between lines
 * so a table row stays whole. A single line longer than `size` is cut.
 */
export function chunkText(text: string, size: number = CHUNK_CHARS): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split(/\r?\n/)) {
    if (line.length > size) {
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < line.length; i += size) chunks.push(line.slice(i, i + size));
      continue;
    }
    if (current && current.length + 1 + line.length > size) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks.filter(c => c.trim());
}

/** Pulls the JSON object out of a model answer (tolerates code fences and stray text). */
export function parseModelJson(text: string): Record<string, unknown> | null {
  const stripped = text.replace(/```(?:json)?/gi, '').trim();
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(stripped.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const norm = (v: unknown): string => String(v ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Same venue (name + city) or same show (date + venue) appearing in two chunks. */
function recordKey(kind: ImportKind, r: Record<string, unknown>): string {
  return kind === 'venues'
    ? `${norm(r.name)}|${norm(r.city)}`
    : `${norm(r.show_date)}|${norm(r.venue_name)}`;
}

/**
 * Runs `fn` over `items`, at most `limit` at once, keeping input order. Once
 * `canStart()` turns false no new item starts; skipped items are undefined.
 */
async function mapLimited<T, R>(
  items: T[], limit: number, fn: (item: T) => Promise<R>, canStart: () => boolean,
): Promise<(R | undefined)[]> {
  const out: (R | undefined)[] = new Array(items.length).fill(undefined);
  let next = 0;
  const worker = async () => {
    while (next < items.length && canStart()) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

interface ChunkOutcome { records: Record<string, unknown>[]; warnings: string[]; failed: boolean }

/**
 * Extracts one chunk. When the answer is cut off or isn't valid JSON, the
 * chunk is split in half and each half retried, up to `depth` times.
 */
async function extractChunk(
  kind: ImportKind, chunk: string, callModel: CallModel, depth: number, canStart: () => boolean,
): Promise<ChunkOutcome> {
  const reply = await callModel(promptFor(kind, chunk), CHUNK_MAX_TOKENS);
  const parsed = reply.truncated ? null : parseModelJson(reply.text);
  const list = parsed?.[kind];

  if (Array.isArray(list)) {
    const warnings = Array.isArray(parsed?.warnings) ? (parsed.warnings as unknown[]).filter((w): w is string => typeof w === 'string') : [];
    return { records: list.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object'), warnings, failed: false };
  }

  const lines = chunk.split('\n');
  if (depth > 0 && lines.length > 1 && canStart()) {
    const mid = Math.ceil(lines.length / 2);
    const [a, b] = await Promise.all([
      extractChunk(kind, lines.slice(0, mid).join('\n'), callModel, depth - 1, canStart),
      extractChunk(kind, lines.slice(mid).join('\n'), callModel, depth - 1, canStart),
    ]);
    return { records: [...a.records, ...b.records], warnings: [...a.warnings, ...b.warnings], failed: a.failed || b.failed };
  }
  return { records: [], warnings: [], failed: true };
}

/**
 * Extracts venues or shows from document text with the model, chunk by chunk.
 *
 * @returns every record found (duplicates across chunks removed) and plain
 *   warnings for anything that was skipped.
 * @throws Error when no part of the document could be read at all.
 */
export async function extractWithModel(
  kind: ImportKind,
  text: string,
  callModel: CallModel,
  { timeBudgetMs = TIME_BUDGET_MS, now = Date.now }: { timeBudgetMs?: number; now?: () => number } = {},
): Promise<ExtractResult> {
  const deadline = now() + timeBudgetMs;
  const canStart = () => now() < deadline;
  const all = chunkText(text);
  const chunks = all.slice(0, MAX_CHUNKS);
  const warnings: string[] = [];
  if (all.length > chunks.length) {
    const pct = Math.round((chunks.join('').length / text.length) * 100);
    warnings.push(`This file is long, so only the first ${pct}% of it was read. Split it into smaller files to import the rest.`);
  }

  const attempted = await mapLimited(chunks, CHUNK_CONCURRENCY, c => extractChunk(kind, c, callModel, 2, canStart), canStart);
  const outcomes = attempted.filter((o): o is ChunkOutcome => o !== undefined);
  const notReached = attempted.length - outcomes.length;
  if (notReached > 0) {
    const readChars = chunks.filter((_, i) => attempted[i] !== undefined).join('').length;
    warnings.push(`This file took too long to read in one go, so only the first ${Math.round((readChars / text.length) * 100)}% was read. Split it into smaller files to import the rest.`);
  }
  if (outcomes.length === 0) throw new Error('Reading this file timed out. Try a smaller file.');
  const failedParts = outcomes.filter(o => o.failed).length;
  if (failedParts === outcomes.length) {
    throw new Error(`Could not pick out any ${kind} from this file. Check that it's a list of ${kind}, or try a CSV or Excel file.`);
  }
  if (failedParts > 0) {
    warnings.push(`Part of this file couldn't be read (${failedParts} of ${outcomes.length} sections). Check the list below for anything missing.`);
  }

  const seen = new Set<string>();
  const records: Record<string, unknown>[] = [];
  for (const r of outcomes.flatMap(o => o.records)) {
    const key = recordKey(kind, r);
    if (key === '|' || seen.has(key)) continue;
    seen.add(key);
    records.push(r);
  }
  warnings.push(...new Set(outcomes.flatMap(o => o.warnings)));
  return { records, warnings };
}
