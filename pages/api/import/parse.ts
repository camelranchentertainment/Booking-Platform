// pages/api/import/parse.ts
//
// Step 1 of the import wizard (components/ImportModal.tsx): reads an uploaded
// venue or show list and returns rows for the user to review. Nothing is saved
// here; /api/import/save writes the rows the user keeps.
//
// POST multipart { file, type: 'venues' | 'shows' } (band admins only)
//   200 { success, type, data: { venues | shows, total_found, warnings }, actId }
//   400 bad upload / unreadable file · 401 · 403 · 405 · 422 nothing found
//   429 AI busy · 502 AI unavailable
//
// Venue spreadsheets (CSV, TXT, XLSX, XLS) are read by matching column headers
// (lib/domain/venueImport.ts): exact, fast and free. The AI is used only for
// PDFs, show lists, and sheets whose headers can't be matched, and it reads the
// whole file in chunks (lib/server/importExtract.ts).

import type { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import * as XLSX from 'xlsx';
import Anthropic from '@anthropic-ai/sdk';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';
import { AppError } from '../../../lib/apiError';
import { extractPdfText } from '../../../lib/server/pdfText';
import { isBandAdminRole } from '../../../lib/server/requireBandAdmin';
import { extractWithModel, type CallModel, type ImportKind } from '../../../lib/server/importExtract';
import { parseTable } from '../../../lib/domain/tabularText';
import {
  mapVenueTable, normaliseState, indexExistingVenues, isExistingVenue, type ImportRow,
} from '../../../lib/domain/venueImport';

// Reading a long PDF takes several model calls; 60 s is the Hobby plan ceiling.
export const config = { api: { bodyParser: false }, maxDuration: 60 };

const ALLOWED_EXTS = new Set(['csv', 'txt', 'xlsx', 'xls', 'pdf']);
const SPREADSHEET_EXTS = new Set(['xlsx', 'xls']);
/** Most rows returned for review; keeps the review table and the save request a sane size. */
const MAX_IMPORT_ROWS = 1000;

/** A venue row as the review table and /api/import/save expect it. */
interface ImportVenue {
  name: string;
  city: string;
  state: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  booking_contact: string | null;
  website: string | null;
  venue_type: string | null;
  capacity: string | null;
  notes: string | null;
  _duplicate?: boolean;
}

const text = (v: unknown): string | null => {
  const s = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  return s && s.toLowerCase() !== 'null' ? s : null;
};

function fromColumns(r: ImportRow): ImportVenue {
  const contact = [r.contact_first, r.contact_last].filter(Boolean).join(' ');
  return {
    name: r.name,
    city: r.city,
    state: r.state,
    address: r.address || null,
    email: r.email || r.contact_email || null,
    phone: r.phone || null,
    booking_contact: contact || null,
    website: r.website || null,
    venue_type: r.venue_type || null,
    capacity: r.capacity || null,
    notes: r.notes || null,
  };
}

function fromModel(r: Record<string, unknown>): ImportVenue | null {
  const name = text(r.name);
  if (!name) return null;
  return {
    name,
    city: text(r.city) ?? '',
    state: normaliseState(text(r.state) ?? ''),
    address: text(r.address),
    email: text(r.email),
    phone: text(r.phone),
    booking_contact: text(r.booking_contact),
    website: text(r.website),
    venue_type: text(r.venue_type),
    capacity: text(r.capacity),
    notes: text(r.notes),
  };
}

/** Every non-empty sheet of a workbook as table rows, plus how many sheets had data. */
function workbookTables(buf: Buffer): { tables: string[][][]; csv: string } {
  const wb = XLSX.read(buf, { type: 'buffer' });
  const tables: string[][][] = [];
  const csvParts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: false })
      .map(row => row.map(cell => String(cell ?? '').trim()))
      .filter(row => row.some(Boolean));
    if (rows.length) {
      tables.push(rows);
      csvParts.push(XLSX.utils.sheet_to_csv(ws));
    }
  }
  return { tables, csv: csvParts.join('\n') };
}

/** Reads the upload into table rows (spreadsheets) and plain text (for the AI). */
async function readUpload(file: formidable.File, ext: string): Promise<{ tables: string[][][]; rawText: string }> {
  const buf = fs.readFileSync(file.filepath);
  if (ext === 'pdf') return { tables: [], rawText: await extractPdfText(buf, 4 * 1024 * 1024) };
  if (SPREADSHEET_EXTS.has(ext)) {
    const { tables, csv } = workbookTables(buf);
    return { tables, rawText: csv };
  }
  const rawText = buf.toString('utf-8');
  return { tables: [parseTable(rawText)], rawText };
}

/** Venues by column headers across every sheet; null when no sheet has a venue-name column. */
function venuesFromColumns(tables: string[][][]): { venues: ImportVenue[]; warnings: string[] } | null {
  const venues: ImportVenue[] = [];
  let skipped = 0;
  let matchedSheets = 0;
  for (const table of tables) {
    const result = mapVenueTable(table, { requireCity: false });
    if (!result.ok) {
      if (result.reason === 'no_rows') { matchedSheets++; skipped += result.skipped; }
      continue;
    }
    matchedSheets++;
    skipped += result.skipped;
    venues.push(...result.rows.map(fromColumns));
  }
  if (matchedSheets === 0) return null;
  const warnings: string[] = [];
  if (tables.length > 1) warnings.push(`Read ${matchedSheets} of ${tables.length} sheets in this workbook.`);
  if (skipped) warnings.push(`${skipped} row${skipped === 1 ? ' had' : 's had'} no venue name and ${skipped === 1 ? 'was' : 'were'} skipped.`);
  return { venues, warnings };
}

function modelCaller(apiKey: string): CallModel {
  // One slow call must not run past the route's 60-second limit.
  const client = new Anthropic({ apiKey, timeout: 50_000, maxRetries: 1 });
  return async (prompt, maxTokens) => {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    return {
      text: msg.content.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '',
      truncated: msg.stop_reason === 'max_tokens',
    };
  };
}

async function extractByAI(kind: ImportKind, rawText: string) {
  const anthropicKey = await getSetting('anthropic_api_key');
  if (!anthropicKey) throw new AppError(500, 'AI not configured — add your Anthropic API key in Settings.');
  try {
    return await extractWithModel(kind, rawText, modelCaller(anthropicKey));
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new AppError(429, 'AI is busy — try again in a moment.');
    if (e instanceof Anthropic.APIError) {
      const inner = (e.error as { error?: { message?: string } } | undefined)?.error?.message;
      throw new AppError(502, inner || 'AI features temporarily unavailable — please try again.');
    }
    if (e instanceof Error) throw new AppError(422, e.message);
    throw e;
  }
}

/** Caps the review list and says so. */
function capRows<T>(rows: T[], warnings: string[]): T[] {
  if (rows.length <= MAX_IMPORT_ROWS) return rows;
  warnings.push(`Showing the first ${MAX_IMPORT_ROWS} of ${rows.length} rows. Import these, then upload the rest as a separate file.`);
  return rows.slice(0, MAX_IMPORT_ROWS);
}

async function handleVenues(actId: string, tables: string[][][], rawText: string) {
  const service = getServiceClient();
  const byColumns = venuesFromColumns(tables);
  let venues: ImportVenue[];
  let warnings: string[];
  if (byColumns && byColumns.venues.length) {
    ({ venues, warnings } = byColumns);
  } else {
    const ai = await extractByAI('venues', rawText);
    venues = ai.records.map(fromModel).filter((v): v is ImportVenue => v !== null);
    warnings = ai.warnings;
  }
  venues = capRows(venues, warnings);

  // One read of the band's venues instead of a query per row.
  const { data: existingRows, error } = await service.from('venues').select('name, city').eq('act_id', actId);
  if (error) throw new AppError(500, 'Could not check your saved venues for duplicates. Please try again.');
  const existing = indexExistingVenues(existingRows ?? []);
  for (const v of venues) v._duplicate = isExistingVenue(existing, v.name, v.city);

  return { venues, total_found: venues.length, warnings };
}

async function handleShows(actId: string, rawText: string) {
  const service = getServiceClient();
  const ai = await extractByAI('shows', rawText);
  const shows = capRows(ai.records.filter(s => typeof s.show_date === 'string' && s.show_date), ai.warnings);

  const { data: booked, error } = await service.from('bookings').select('show_date').eq('act_id', actId);
  if (error) throw new AppError(500, 'Could not check your saved shows for duplicates. Please try again.');
  const dates = new Set((booked ?? []).map(b => b.show_date as string));
  for (const s of shows) s._duplicate = dates.has(String(s.show_date));

  return { shows, total_found: shows.length, warnings: ai.warnings };
}

/** Reads an uploaded venue or show list and returns rows for review. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await service.from('profiles').select('act_id, role').eq('id', user.id).single();
  if (!profile?.act_id) return res.status(400).json({ error: 'No act linked to your account' });
  if (!isBandAdminRole(profile.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const form = formidable({ maxFileSize: 4 * 1024 * 1024 }); // Vercel caps bodies at 4.5 MB
  let fields: formidable.Fields;
  let files: formidable.Files;
  try {
    [fields, files] = await form.parse(req);
  } catch (e) {
    return res.status(400).json({ error: `Upload failed: ${e instanceof Error ? e.message : 'unknown error'}` });
  }

  const fileArr = files.file;
  const file = Array.isArray(fileArr) ? fileArr[0] : fileArr;
  const typeVal = fields.type;
  const importType = (Array.isArray(typeVal) ? typeVal[0] : typeVal) as string | undefined;

  if (!file) return res.status(400).json({ error: 'No file provided' });
  if (importType !== 'venues' && importType !== 'shows') {
    return res.status(400).json({ error: 'Invalid import type. Use venues or shows.' });
  }
  const ext = (file.originalFilename ?? '').split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTS.has(ext)) {
    return res.status(400).json({ error: 'Unsupported file type. Use CSV, Excel (.xlsx/.xls), or PDF.' });
  }

  try {
    let upload: { tables: string[][][]; rawText: string };
    try {
      upload = await readUpload(file, ext);
    } catch (e) {
      if (e instanceof AppError) throw e;
      console.error('[import/parse] could not read file', { ext, message: e instanceof Error ? e.message : String(e) });
      throw new AppError(400, "That file couldn't be opened. Try saving it again, or export it as CSV.");
    } finally {
      try { fs.unlinkSync(file.filepath); } catch { /* temp file already gone */ }
    }
    if (!upload.rawText.trim()) throw new AppError(400, 'File appears to be empty or unreadable.');

    const data = importType === 'venues'
      ? await handleVenues(profile.act_id, upload.tables, upload.rawText)
      : await handleShows(profile.act_id, upload.rawText);

    const found = importType === 'venues' ? (data as { venues: unknown[] }).venues.length : (data as { shows: unknown[] }).shows.length;
    if (found === 0) throw new AppError(422, `No ${importType} found in this file. Check that it's a list of ${importType} with a header row.`);

    return res.status(200).json({ success: true, type: importType, data, actId: profile.act_id });
  } catch (e) {
    if (e instanceof AppError) return res.status(e.statusCode).json({ error: e.message });
    console.error('[import/parse] failed', { importType, ext, message: e instanceof Error ? e.message : String(e) });
    return res.status(500).json({ error: 'Something went wrong reading that file. Please try again.' });
  }
}
