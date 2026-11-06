// components/setlists/NewSetListModal.tsx
//
// Start a set list: for an upcoming show or as a reusable template, either
// blank or copied from an existing set list ("same as last night").
// Shows that already have a set list are listed but can't be picked again.

import { useId, useMemo, useState, type FormEvent } from 'react';
import { useModalKeys } from '../venues/useModalKeys';
import { supabase } from '../../lib/supabase';
import { createSetList, showLabel, type ShowOption } from '../../lib/setListQueries';
import { LIMITS, type SetListRow } from '../../lib/domain/setLists';
import { formatShowDate } from '../../lib/formatDate';

interface Props {
  actId: string;
  shows: readonly ShowOption[];
  setLists: readonly SetListRow[];
  /** Pre-selects a set list to copy (the "Duplicate" action). */
  copyFromId?: string | null;
  onClose: () => void;
  onCreated: (row: SetListRow) => void;
}

const showDate = (d: string): string => formatShowDate(d, { weekday: 'short', month: 'short', day: 'numeric' });

/** Dialog for creating a set list. */
export default function NewSetListModal({ actId, shows, setLists, copyFromId = null, onClose, onCreated }: Props) {
  const uid = useId();
  const takenShowIds = useMemo(
    () => new Set(setLists.map(s => s.booking_id).filter((id): id is string => !!id)),
    [setLists],
  );
  const firstOpenShow = shows.find(s => !takenShowIds.has(s.id));

  const [target, setTarget] = useState<string>(firstOpenShow ? firstOpenShow.id : 'template');
  const [copyFrom, setCopyFrom] = useState<string>(copyFromId ?? '');
  const [name, setName] = useState<string>('');
  const [nameTouched, setNameTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useModalKeys<HTMLDivElement>(saving ? () => undefined : onClose);

  const show = shows.find(s => s.id === target);
  // Suggest a name from the show until the admin types their own.
  const suggested = show ? `${show.venue_name?.trim() || 'Show'} · ${showDate(show.show_date)}` : 'Standard set';
  const effectiveName = nameTouched ? name : suggested;
  const nameError = nameTouched && !name.trim() ? 'Give the set list a name.' : '';

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (saving) return;
    const finalName = effectiveName.trim();
    if (!finalName) { setNameTouched(true); return; }
    setSaving(true);
    setError('');
    const res = await createSetList(
      supabase, actId, finalName.slice(0, LIMITS.setName),
      target === 'template' ? { kind: 'template' } : { kind: 'show', bookingId: target },
      copyFrom || null,
    );
    setSaving(false);
    if (!res.ok) { setError(res.message); return; }
    onCreated(res.data);
  };

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal sl-modal" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
        <div className="modal-header">
          <h2 className="modal-title" id={`${uid}-title`}>New set list</h2>
        </div>
        <form className="sl-form" onSubmit={e => void submit(e)} noValidate>
          <div className="field">
            <label className="field-label" htmlFor={`${uid}-target`}>What’s it for?</label>
            <select id={`${uid}-target`} className="select" value={target} onChange={e => setTarget(e.target.value)}>
              <option value="template">A reusable template (no show)</option>
              {shows.length > 0 && (
                <optgroup label="Upcoming shows">
                  {shows.map(s => (
                    <option key={s.id} value={s.id} disabled={takenShowIds.has(s.id)}>
                      {showDate(s.show_date)} — {showLabel(s)}{takenShowIds.has(s.id) ? ' (has a set list)' : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {shows.length === 0 && (
              <span className="sl-hint">No upcoming confirmed shows yet — start with a template and attach it later by copying.</span>
            )}
          </div>

          <div className="field">
            <label className="field-label" htmlFor={`${uid}-name`}>Name</label>
            <input id={`${uid}-name`} className="input" value={effectiveName} maxLength={LIMITS.setName}
              onChange={e => { setNameTouched(true); setName(e.target.value); }}
              aria-invalid={!!nameError} aria-describedby={nameError ? `${uid}-name-err` : undefined} />
            {nameError && <span id={`${uid}-name-err`} className="sl-field-error" role="alert">{nameError}</span>}
          </div>

          <div className="field">
            <label className="field-label" htmlFor={`${uid}-copy`}>Start from</label>
            <select id={`${uid}-copy`} className="select" value={copyFrom} onChange={e => setCopyFrom(e.target.value)}>
              <option value="">A blank list</option>
              {setLists.map(s => (
                <option key={s.id} value={s.id}>A copy of “{s.name}”{s.is_template ? ' (template)' : ''}</option>
              ))}
            </select>
          </div>

          {error && <p className="sl-error" role="alert">{error}</p>}
          <div className="sl-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
              {saving ? 'Creating…' : 'Create and open'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
