// lib/domain/venueImport.ts
//
// Parses the Venues page's "Bulk import" paste box: a markdown table (the
// format the AI venue-research prompt produces) or CSV with a header row.
// Pure and unit-tested (__tests__/lib/domain/venueImport.test.ts); the page
// only shows the rows and writes the selected ones.

export interface ImportRow {
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string;
  email: string;
  website: string;
  venue_type: string;
  capacity: string;
  contact_first: string;
  contact_last: string;
  contact_title: string;
  contact_email: string;
  notes: string;
  /** Ticked for import in the review list. */
  selected: boolean;
}

export type ParseResult =
  | { ok: true; rows: ImportRow[]; /** Rows dropped for lacking a venue name or city. */ skipped: number }
  | { ok: false; error: string };

/** Header CSV the page offers as a download. */
export const IMPORT_TEMPLATE_CSV =
  'Venue Name,City,State,Address,Phone,Booking Email,Website,Venue Type,Capacity,Contact Name,Contact Title,Notes\n';

const clean = (s: string | undefined): string => (s ?? '').trim().replace(/^["']|["']$/g, '').trim();
const headerKey = (h: string): string => clean(h).toLowerCase().replace(/[^a-z0-9]/g, '_');
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Splits raw lines into header-keyed records. Markdown tables are detected by a `|` in the first line. */
function toRecords(lines: string[]): Record<string, string>[] {
  const isTable = lines[0].includes('|');
  const data = isTable ? lines.filter(l => !/^\s*\|?\s*[-:]+\s*\|/.test(l)) : lines;
  const split = (line: string): string[] => (isTable ? line.split('|') : line.split(',')).map(clean);
  const headers = (isTable ? data[0].split('|') : data[0].split(',')).map(headerKey);
  const records: Record<string, string>[] = [];
  for (let i = 1; i < data.length; i++) {
    const cells = split(data[i]);
    const rec: Record<string, string> = {};
    headers.forEach((h, idx) => { if (h) rec[h] = cells[idx] ?? ''; });
    if (rec.venue_name || rec.name) records.push(rec);
  }
  return records;
}

function toRow(r: Record<string, string>): ImportRow {
  const contact = clean(r.contact_name || r.booking_contact_name || '');
  const [first = '', ...rest] = contact.split(' ');
  return {
    name: clean(r.venue_name || r.name),
    address: clean(r.address),
    city: clean(r.city),
    state: clean(r.state),
    phone: clean(r.phone || r.phone_number),
    email: clean(r.booking_email || r.general___info_email || r.general_email || r.email),
    website: clean(r.website),
    venue_type: clean(r.type || r.venue_type).toLowerCase(),
    capacity: clean(r.capacity),
    contact_first: clean(first),
    contact_last: clean(rest.join(' ')),
    contact_title: clean(r.contact_title || r.booking_contact_title),
    contact_email: clean(r.booking_email || r.contact_email),
    notes: clean(r.notes),
    selected: true,
  };
}

/** Parses pasted text into import rows. Every row needs a venue name and a city. */
export function parseVenueImport(text: string): ParseResult {
  const lines = text.trim().split('\n').filter(l => l.trim());
  if (!lines.length) return { ok: false, error: 'Paste your venue list first.' };
  const records = toRecords(lines);
  if (!records.length) {
    return { ok: false, error: 'Could not read any venue rows. Make sure the first line is a header row.' };
  }
  const all = records.map(toRow);
  const rows = all.filter(r => r.name && r.city);
  const skipped = all.length - rows.length;
  if (!rows.length) {
    return { ok: false, error: `Rows found, but none had a Venue Name and City — ${plural(skipped, 'row')} skipped. Check your column headers.` };
  }
  return { ok: true, rows, skipped };
}

/** Capacity text → positive whole number, or null ("1,200" → 1200, "TBD" → null). */
export function parseCapacity(raw: string): number | null {
  const n = Number(raw.replace(/[,\s]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}
