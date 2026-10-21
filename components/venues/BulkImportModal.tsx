// components/venues/BulkImportModal.tsx
//
// "Bulk import" dialog on the Venues page: paste a markdown table or CSV,
// review the rows, import the ticked ones. A venue already in the band's list
// (same name + city, case-insensitive) is updated instead of duplicated, and
// a new venue with a contact name or email also gets a `contacts` row.

import { useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  parseVenueImport, parseCapacity, IMPORT_TEMPLATE_CSV, type ImportRow,
} from '../../lib/domain/venueImport';
import { ilikeExact } from '../../lib/domain/venueStats';
import { getVenueSession } from './venueSession';
import { useModalKeys } from './useModalKeys';

interface Props {
  onClose: () => void;
  /** Called after an import run so the page can reload its list. */
  onImported: () => void;
}

interface ImportTally { added: number; updated: number; unticked: number; failed: number }

type RowOutcome = 'added' | 'updated' | 'failed';

/** Writes one row: update the matching venue, or insert it (plus its contact). Never throws. */
async function importRow(row: ImportRow, actId: string): Promise<RowOutcome> {
  const details = {
    address: row.address || null,
    phone: row.phone || null,
    email: row.email || null,
    website: row.website || null,
    venue_type: row.venue_type || null,
    capacity: parseCapacity(row.capacity),
    notes: row.notes || null,
  };
  try {
    const { data: existing, error: findError } = await supabase
      .from('venues').select('id').eq('act_id', actId)
      .ilike('name', ilikeExact(row.name)).ilike('city', ilikeExact(row.city))
      .limit(1).maybeSingle();
    if (findError) throw findError;

    if (existing) {
      // Only fill in what the paste actually has: a blank cell must not wipe an
      // email or phone the band already found for this venue.
      const patch = Object.fromEntries(Object.entries(details).filter(([, value]) => value !== null));
      if (Object.keys(patch).length === 0) return 'updated';
      const { error } = await supabase.from('venues').update(patch).eq('id', existing.id);
      if (error) throw error;
      return 'updated';
    }

    const { data: created, error: insertError } = await supabase.from('venues').insert({
      ...details, act_id: actId, name: row.name, city: row.city, state: row.state || '', source: 'import', country: 'US',
    }).select('id').single();
    if (insertError || !created) throw insertError ?? new Error('insert returned no row');

    if (row.contact_first || row.contact_email) {
      const { error: contactError } = await supabase.from('contacts').insert({
        act_id: actId,
        venue_id: created.id,
        first_name: row.contact_first,
        last_name: row.contact_last,
        title: row.contact_title || null,
        email: row.contact_email || null,
        status: 'not_contacted',
      });
      // The venue is in; a missing contact is worth logging but not a failed row.
      if (contactError) console.error('[venues] import contact failed', { code: contactError.code });
    }
    return 'added';
  } catch (err) {
    console.error('[venues] import row failed', err);
    return 'failed';
  }
}

function downloadTemplate(): void {
  const url = URL.createObjectURL(new Blob([IMPORT_TEMPLATE_CSV], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'venue-import-template.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export default function BulkImportModal({ onClose, onImported }: Props) {
  const [text, setText] = useState('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<ImportTally | null>(null);
  const dialogRef = useModalKeys<HTMLDivElement>(saving ? () => undefined : onClose);

  const parse = (): void => {
    setError('');
    setNote('');
    const result = parseVenueImport(text);
    if (!result.ok) { setError(result.error); return; }
    setRows(result.rows);
    if (result.skipped > 0) setNote(`${result.skipped} row${result.skipped === 1 ? '' : 's'} skipped (missing Venue Name or City).`);
  };

  const run = async (): Promise<void> => {
    if (!rows || saving) return;
    setSaving(true);
    setError('');
    try {
      const s = await getVenueSession();
      if (!s?.actId) { setError('Your session expired or isn’t linked to a band. Sign in again and retry.'); return; }
      const picked = rows.filter(r => r.selected);
      const tally: ImportTally = { added: 0, updated: 0, unticked: rows.length - picked.length, failed: 0 };
      // One at a time: keeps the duplicate check honest when the paste repeats a venue.
      for (const row of picked) tally[await importRow(row, s.actId)]++;
      setDone(tally);
      onImported();
    } finally {
      setSaving(false);
    }
  };

  const toggle = (i: number, on: boolean): void =>
    setRows(rs => rs && rs.map((r, idx) => (idx === i ? { ...r, selected: on } : r)));
  const selectedCount = rows?.filter(r => r.selected).length ?? 0;

  return (
    <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div ref={dialogRef} className="modal venues-modal venues-modal--wide" role="dialog" aria-modal="true" aria-labelledby="bulk-import-title">
        <div className="modal-header">
          <h3 className="modal-title" id="bulk-import-title">Bulk import venues</h3>
          <button type="button" className="btn btn-ghost btn-sm" aria-label="Close" onClick={onClose} disabled={saving}>✕</button>
        </div>

        {done ? (
          <div className="venues-import-done" role="status">
            <div className="tours-empty-title">Import finished</div>
            <dl className="tour-card-counts venues-import-tally">
              <div><dt>Added</dt><dd>{done.added}</dd></div>
              <div><dt>Updated</dt><dd>{done.updated}</dd></div>
              {done.unticked > 0 && <div><dt>Skipped</dt><dd>{done.unticked}</dd></div>}
              {done.failed > 0 && <div><dt>Failed</dt><dd className="venues-error-text">{done.failed}</dd></div>}
            </dl>
            {done.failed > 0 && <p className="venues-hint">Rows that failed weren’t saved. Fix them in your sheet and import just those again.</p>}
            <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        ) : rows === null ? (
          <div className="venues-form">
            <p className="venues-copy">
              Paste a <strong>markdown table</strong> (the AI venue-research prompt gives you one) or a <strong>CSV with a header row</strong>.
              Each row needs <strong>Venue Name</strong> and <strong>City</strong>. Venues already in your list are updated, not duplicated.
            </p>
            <label className="sr-only" htmlFor="bulk-import-text">Venue list</label>
            <textarea
              id="bulk-import-text"
              className="textarea venues-import-text"
              rows={12}
              placeholder="Paste a markdown table or CSV here…"
              value={text}
              onChange={e => setText(e.target.value)}
            />
            {error && <p className="venues-error" role="alert">{error}</p>}
            <div className="venues-modal-actions venues-modal-actions--split">
              <button type="button" className="venues-link-btn" onClick={downloadTemplate}>↓ Download template</button>
              <div className="venues-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={parse} disabled={!text.trim()}>Review rows →</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="venues-form">
            <p className="venues-copy">{rows.length} venue{rows.length === 1 ? '' : 's'} ready. Untick any you want to skip.</p>
            {note && <p className="venues-hint">{note}</p>}
            <ul className="venues-import-list">
              {rows.map((row, i) => (
                <li key={`${row.name}-${i}`}>
                  <label className="venues-import-row">
                    <input type="checkbox" checked={row.selected} onChange={e => toggle(i, e.target.checked)} />
                    <span className="venues-import-main">
                      <strong>{row.name}</strong>
                      <span>{[[row.city, row.state].filter(Boolean).join(', '), row.phone, row.email, row.capacity && `cap ${row.capacity}`].filter(Boolean).join(' · ')}</span>
                      {row.contact_first && <span className="venues-accent">Contact: {row.contact_first} {row.contact_last}{row.contact_title ? ` (${row.contact_title})` : ''}</span>}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {error && <p className="venues-error" role="alert">{error}</p>}
            <div className="venues-modal-actions venues-modal-actions--split">
              <button type="button" className="venues-link-btn" onClick={() => setRows(null)} disabled={saving}>← Back</button>
              <div className="venues-modal-actions">
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
                <button type="button" className="btn btn-primary" onClick={() => void run()} disabled={saving || selectedCount === 0}>
                  {saving ? 'Importing…' : `Import ${selectedCount} venue${selectedCount === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
