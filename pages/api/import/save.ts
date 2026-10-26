// pages/api/import/save.ts
//
// Step 2 of the import wizard: saves the rows the user kept on the review
// screen (/api/import/parse produced them).
//
// POST { type: 'venues' | 'shows', data: { venues | shows } } (band admins only)
//   200 { success, saved, skipped, errors }

import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { isBandAdminRole } from '../../../lib/server/requireBandAdmin';
import {
  indexExistingVenues, isExistingVenue, normaliseState, parseCapacity, venueMatchKey,
} from '../../../lib/domain/venueImport';

export const config = { maxDuration: 60, api: { bodyParser: { sizeLimit: '4mb' } } };

/** Most venues saved per request (matches MAX_IMPORT_ROWS in parse.ts). */
const MAX_SAVE_ROWS = 1000;
/** Rows per insert; a failed batch is retried row by row to name the bad row. */
const INSERT_BATCH = 100;

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '');
const orNull = (v: unknown): string | null => str(v) || null;

type VenueInsert = Record<string, unknown> & { name: string };

/** Saves venues the user kept, skipping any the band already has. */
async function saveVenues(actId: string, input: unknown[]): Promise<{ saved: number; skipped: number; errors: string[] }> {
  const service = getServiceClient();
  const errors: string[] = [];
  let skipped = 0;

  const { data: existingRows, error: loadErr } = await service.from('venues').select('name, city').eq('act_id', actId);
  if (loadErr) throw new Error(`Could not check your saved venues: ${loadErr.message}`);
  const existing = indexExistingVenues(existingRows ?? []);

  const seenInFile = new Set<string>();
  const rows: VenueInsert[] = [];
  for (const raw of input.slice(0, MAX_SAVE_ROWS)) {
    const v = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const name = str(v.name);
    const city = str(v.city);
    if (!name) { skipped++; continue; }
    const key = venueMatchKey(name, city);
    if (seenInFile.has(key) || isExistingVenue(existing, name, city)) { skipped++; continue; }
    seenInFile.add(key);
    rows.push({
      act_id: actId,
      name,
      // city and state are NOT NULL (default ''); sending null failed every row without them.
      city,
      state: normaliseState(str(v.state)),
      address: orNull(v.address),
      email: orNull(v.email),
      phone: orNull(v.phone),
      booking_contact: orNull(v.booking_contact),
      website: orNull(v.website),
      venue_type: orNull(v.venue_type)?.toLowerCase() ?? null,
      capacity: parseCapacity(str(v.capacity)),
      notes: orNull(v.notes),
      source: 'import',
    });
  }
  skipped += Math.max(0, input.length - MAX_SAVE_ROWS);

  let saved = 0;
  for (let i = 0; i < rows.length; i += INSERT_BATCH) {
    const batch = rows.slice(i, i + INSERT_BATCH);
    const { error } = await service.from('venues').insert(batch);
    if (!error) { saved += batch.length; continue; }
    // One bad row fails the whole batch; retry singly so the rest still save.
    for (const row of batch) {
      const { error: rowErr } = await service.from('venues').insert(row);
      if (rowErr) errors.push(`${row.name}: ${rowErr.message}`);
      else saved++;
    }
  }
  return { saved, skipped, errors };
}

/** Saves shows the user kept, skipping dates the band already has a show on. */
async function saveShows(actId: string, input: unknown[]): Promise<{ saved: number; skipped: number; errors: string[] }> {
  const service = getServiceClient();
  const errors: string[] = [];
  let saved = 0;
  let skipped = 0;

  for (const raw of input.slice(0, MAX_SAVE_ROWS)) {
    const show = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
    const showDate = str(show.show_date);
    if (!showDate) { skipped++; continue; }

    let venueId: string | null = null;
    const venueName = str(show.venue_name);
    if (venueName) {
      const { data: venueMatch } = await service.from('venues').select('id')
        .eq('act_id', actId).ilike('name', `%${venueName}%`).limit(1).maybeSingle();
      if (venueMatch) venueId = venueMatch.id;
    }

    const { data: existing } = await service.from('bookings').select('id')
      .eq('act_id', actId).eq('show_date', showDate).limit(1).maybeSingle();
    if (existing) { skipped++; continue; }

    const fee = parseFloat(str(show.fee));
    const { error } = await service.from('bookings').insert({
      act_id: actId,
      venue_id: venueId,
      show_date: showDate,
      status: str(show.status) || 'confirmed',
      agreed_amount: Number.isFinite(fee) ? fee : null,
      deal_type: orNull(show.deal_type),
      set_time: orNull(show.set_time),
      notes: orNull(show.notes),
      source: 'import',
    });
    if (error) errors.push(`${showDate}: ${error.message}`);
    else saved++;
  }
  return { saved, skipped, errors };
}

/** Saves the reviewed import rows to the caller's band. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await service.from('profiles').select('act_id, role').eq('id', user.id).single();
  if (!profile?.act_id) return res.status(400).json({ error: 'No act linked' });
  if (!isBandAdminRole(profile.role)) return res.status(403).json({ error: 'Insufficient permissions' });

  const { type, data } = (req.body ?? {}) as { type?: unknown; data?: { venues?: unknown; shows?: unknown } };
  if (type !== 'venues' && type !== 'shows') return res.status(400).json({ error: 'Invalid import type. Use venues or shows.' });
  const list = type === 'venues' ? data?.venues : data?.shows;
  if (!Array.isArray(list)) return res.status(400).json({ error: `No ${type} to save.` });

  try {
    const result = type === 'venues' ? await saveVenues(profile.act_id, list) : await saveShows(profile.act_id, list);
    return res.status(200).json({ success: true, ...result });
  } catch (e) {
    console.error('[import/save] failed', { type, message: e instanceof Error ? e.message : String(e) });
    return res.status(500).json({ error: 'Saving failed. Nothing may have been saved — refresh the Venues page and check before trying again.' });
  }
}
