// components/setlists/SongFormModal.tsx
//
// Add or edit a song in the band's library. Validates on blur and on submit
// against the same limits the database enforces, so a save only fails for
// reasons the admin can't see (duplicates, network).

import { useId, useState, type FormEvent } from 'react';
import { useModalKeys } from '../venues/useModalKeys';
import { supabase } from '../../lib/supabase';
import { saveSong, type SongInput } from '../../lib/setListQueries';
import { LIMITS, formatDuration, parseDuration, type SongRow } from '../../lib/domain/setLists';

interface Props {
  actId: string;
  /** Song to edit; omit to add a new one. */
  song?: SongRow;
  /** Pre-fills the title when adding from the builder's search box. */
  initialTitle?: string;
  onClose: () => void;
  onSaved: (song: SongRow) => void;
}

type Field = 'title' | 'artist' | 'song_key' | 'tempo' | 'length' | 'notes';
type Errors = Partial<Record<Field, string>>;

interface FormState {
  title: string;
  artist: string;
  song_key: string;
  tempo: string;
  length: string;
  notes: string;
}

function validate(f: FormState): { errors: Errors; input: SongInput | null } {
  const errors: Errors = {};
  const title = f.title.trim();
  if (!title) errors.title = 'Give the song a title.';
  else if (title.length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`;

  const artist = f.artist.trim();
  if (artist.length > LIMITS.artist) errors.artist = `Keep the artist under ${LIMITS.artist} characters.`;

  const key = f.song_key.trim();
  if (key.length > LIMITS.key) errors.song_key = `Keys are short — like “G” or “F#m”.`;

  let tempo: number | null = null;
  if (f.tempo.trim()) {
    const n = Number(f.tempo.trim());
    if (!Number.isInteger(n) || n < LIMITS.bpmMin || n > LIMITS.bpmMax) {
      errors.tempo = `Tempo is a whole number from ${LIMITS.bpmMin} to ${LIMITS.bpmMax}.`;
    } else tempo = n;
  }

  const length = parseDuration(f.length);
  if (length === undefined) errors.length = 'Enter the length as minutes:seconds, like 3:45.';

  const notes = f.notes.trim();
  if (notes.length > LIMITS.songNotes) errors.notes = `Keep notes under ${LIMITS.songNotes} characters.`;

  if (Object.keys(errors).length) return { errors, input: null };
  return {
    errors,
    input: {
      title,
      artist: artist || null,
      song_key: key || null,
      tempo_bpm: tempo,
      duration_sec: length ?? null,
      notes: notes || null,
    },
  };
}

/** Modal form for one song. */
export default function SongFormModal({ actId, song, initialTitle, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>({
    title: song?.title ?? initialTitle ?? '',
    artist: song?.artist ?? '',
    song_key: song?.song_key ?? '',
    tempo: song?.tempo_bpm ? String(song.tempo_bpm) : '',
    length: formatDuration(song?.duration_sec),
    notes: song?.notes ?? '',
  });
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const dialogRef = useModalKeys<HTMLDivElement>(saving ? () => undefined : onClose);
  const uid = useId();
  const id = (f: Field): string => `${uid}-${f}`;

  const set = (k: keyof FormState) => (e: { target: { value: string } }): void =>
    setForm(prev => ({ ...prev, [k]: e.target.value }));

  // Validate a single field on blur so people get feedback before they submit.
  const blur = (field: Field) => (): void => {
    const { errors: all } = validate(form);
    setErrors(prev => ({ ...prev, [field]: all[field] }));
  };

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (saving) return;
    const { errors: found, input } = validate(form);
    setErrors(found);
    if (!input) return;
    setSaving(true);
    setSaveError('');
    const res = await saveSong(supabase, actId, input, song?.id);
    setSaving(false);
    if (!res.ok) { setSaveError(res.message); return; }
    onSaved(res.data);
    onClose();
  };

  const err = (f: Field) => errors[f]
    ? <span id={`${id(f)}-err`} className="sl-field-error" role="alert">{errors[f]}</span>
    : null;
  const describedBy = (f: Field, hint?: string): string | undefined =>
    [errors[f] ? `${id(f)}-err` : null, hint ?? null].filter(Boolean).join(' ') || undefined;

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal sl-modal" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`}>
        <div className="modal-header">
          <h2 className="modal-title" id={`${uid}-title`}>{song ? 'Edit song' : 'Add a song'}</h2>
        </div>
        <form onSubmit={e => void submit(e)} noValidate className="sl-form">
          <div className="field">
            <label className="field-label" htmlFor={id('title')}>Title</label>
            <input id={id('title')} className="input" value={form.title} onChange={set('title')} onBlur={blur('title')}
              autoFocus required maxLength={LIMITS.title} aria-invalid={!!errors.title} aria-describedby={describedBy('title')} />
            {err('title')}
          </div>
          <div className="field">
            <label className="field-label" htmlFor={id('artist')}>Original artist <span className="sl-optional">(covers)</span></label>
            <input id={id('artist')} className="input" value={form.artist} onChange={set('artist')} onBlur={blur('artist')}
              maxLength={LIMITS.artist} aria-invalid={!!errors.artist} aria-describedby={describedBy('artist')} />
            {err('artist')}
          </div>
          <div className="sl-form-row">
            <div className="field">
              <label className="field-label" htmlFor={id('song_key')}>Key</label>
              <input id={id('song_key')} className="input" value={form.song_key} onChange={set('song_key')} onBlur={blur('song_key')}
                placeholder="G" maxLength={LIMITS.key} aria-invalid={!!errors.song_key} aria-describedby={describedBy('song_key')} />
              {err('song_key')}
            </div>
            <div className="field">
              <label className="field-label" htmlFor={id('tempo')}>Tempo (BPM)</label>
              <input id={id('tempo')} className="input" inputMode="numeric" value={form.tempo} onChange={set('tempo')} onBlur={blur('tempo')}
                placeholder="120" aria-invalid={!!errors.tempo} aria-describedby={describedBy('tempo')} />
              {err('tempo')}
            </div>
            <div className="field">
              <label className="field-label" htmlFor={id('length')}>Length</label>
              <input id={id('length')} className="input" inputMode="numeric" value={form.length} onChange={set('length')} onBlur={blur('length')}
                placeholder="3:45" aria-invalid={!!errors.length} aria-describedby={describedBy('length')} />
              {err('length')}
            </div>
          </div>
          <div className="field">
            <label className="field-label" htmlFor={id('notes')}>Notes for the band</label>
            <textarea id={id('notes')} className="textarea" rows={3} value={form.notes} onChange={set('notes')} onBlur={blur('notes')}
              placeholder="Capo 2 · count in slow · long outro" maxLength={LIMITS.songNotes}
              aria-invalid={!!errors.notes} aria-describedby={describedBy('notes')} />
            {err('notes')}
          </div>
          {saveError && <p className="sl-error" role="alert">{saveError}</p>}
          <div className="sl-modal-actions">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving} aria-busy={saving}>
              {saving ? 'Saving…' : song ? 'Save song' : 'Add song'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
