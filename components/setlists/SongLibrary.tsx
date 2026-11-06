// components/setlists/SongLibrary.tsx
//
// The band's song library: search, add, edit and remove songs. Removing a song
// archives it (soft delete); a song that is still on a set list can't be
// removed until it's taken off that list, because the database won't accept
// archived songs on a list being saved.

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { archiveSong, setListsUsingSong } from '../../lib/setListQueries';
import { formatDuration, type SongRow } from '../../lib/domain/setLists';
import { useModalKeys } from '../venues/useModalKeys';
import SongFormModal from './SongFormModal';

interface Props {
  actId: string;
  songs: readonly SongRow[];
  /** Called with the full updated library after any change. */
  onChange: (songs: SongRow[]) => void;
}

const byTitle = (a: SongRow, b: SongRow): number => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });

/** Library panel for the Set Lists page. */
export default function SongLibrary({ actId, songs, onChange }: Props) {
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<SongRow | 'new' | null>(null);
  const [removing, setRemoving] = useState<SongRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(s => s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q));
  }, [songs, query]);

  const saved = (song: SongRow): void => {
    const rest = songs.filter(s => s.id !== song.id);
    onChange([...rest, song].sort(byTitle));
  };

  return (
    <section className="card sl-panel" aria-labelledby="sl-library-title">
      <div className="sl-panel-head">
        <div>
          <h2 className="sl-panel-title" id="sl-library-title">Song library</h2>
          <p className="sl-panel-sub">{songs.length === 1 ? '1 song' : `${songs.length} songs`}</p>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}>+ Add song</button>
      </div>

      {songs.length > 0 && (
        <div className="field sl-search">
          <label className="sr-only" htmlFor="sl-library-search">Search songs</label>
          <input id="sl-library-search" className="input" type="search" placeholder="Search songs or artists"
            value={query} onChange={e => setQuery(e.target.value)} />
        </div>
      )}

      {songs.length === 0 ? (
        <div className="sl-empty">
          <p className="sl-empty-title">No songs yet</p>
          <p>Add your songs once — title, key, tempo and length — then build any set from them in seconds.</p>
          <button type="button" className="btn btn-secondary" onClick={() => setEditing('new')}>Add your first song</button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="sl-muted" role="status">No songs match “{query.trim()}”.</p>
      ) : (
        <ul className="sl-song-list">
          {filtered.map(s => (
            <li key={s.id} className="sl-song">
              <div className="sl-song-main">
                <span className="sl-song-title">{s.title}</span>
                {s.artist && <span className="sl-song-artist">{s.artist}</span>}
              </div>
              <div className="sl-song-meta mono">
                {s.song_key && <span title="Key">{s.song_key}</span>}
                {s.tempo_bpm && <span title="Tempo">{s.tempo_bpm} bpm</span>}
                {s.duration_sec && <span title="Length">{formatDuration(s.duration_sec)}</span>}
              </div>
              <div className="sl-song-actions">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(s)} aria-label={`Edit ${s.title}`}>Edit</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRemoving(s)} aria-label={`Remove ${s.title}`}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <SongFormModal actId={actId} song={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)} onSaved={saved} />
      )}
      {removing && (
        <RemoveSongDialog actId={actId} song={removing} onClose={() => setRemoving(null)}
          onRemoved={() => onChange(songs.filter(s => s.id !== removing.id))} />
      )}
    </section>
  );
}

interface RemoveProps {
  actId: string;
  song: SongRow;
  onClose: () => void;
  onRemoved: () => void;
}

function RemoveSongDialog({ actId, song, onClose, onRemoved }: RemoveProps) {
  const [usage, setUsage] = useState<string[] | null>(null);
  const [checkError, setCheckError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useModalKeys<HTMLDivElement>(busy ? () => undefined : onClose);

  useEffect(() => {
    let cancelled = false;
    void setListsUsingSong(supabase, song.id).then(res => {
      if (cancelled) return;
      if (res.ok) setUsage(res.data);
      else setCheckError(res.message);
    });
    return () => { cancelled = true; };
  }, [song.id]);

  const remove = async (): Promise<void> => {
    setBusy(true);
    setError('');
    const res = await archiveSong(supabase, actId, song.id);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    onRemoved();
    onClose();
  };

  const inUse = usage !== null && usage.length > 0;

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal sl-modal sl-modal--narrow" role="alertdialog" aria-modal="true"
        aria-labelledby="sl-remove-title" aria-describedby="sl-remove-desc">
        <div className="modal-header">
          <h2 className="modal-title" id="sl-remove-title">Remove song?</h2>
        </div>
        <div id="sl-remove-desc" className="sl-form">
          {usage === null && !checkError && <p className="sl-muted" role="status">Checking your set lists…</p>}
          {checkError && <p className="sl-error" role="alert">{checkError}</p>}
          {usage !== null && !inUse && (
            <p>Remove <strong>{song.title}</strong> from your library? Set lists you’ve already pushed keep their copy.</p>
          )}
          {inUse && (
            <p>
              <strong>{song.title}</strong> is on {usage.length === 1 ? 'a set list' : `${usage.length} set lists`}:{' '}
              {usage.join(', ')}. Take it off {usage.length === 1 ? 'that list' : 'those lists'} first, then remove it here.
            </p>
          )}
          {error && <p className="sl-error" role="alert">{error}</p>}
        </div>
        <div className="sl-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>{inUse ? 'OK' : 'Keep it'}</button>
          {usage !== null && !inUse && (
            <button type="button" className="btn btn-danger" onClick={() => void remove()} disabled={busy} aria-busy={busy}>
              {busy ? 'Removing…' : 'Remove song'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
