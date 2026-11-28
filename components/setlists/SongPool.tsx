// components/setlists/SongPool.tsx
//
// "Song List" button for the set list builder. Opens the band's whole song
// library as a tap-to-add list, so nobody has to type to find a song. Songs
// already in the set drop out of the list and come back if removed from the set.

import { useId, useMemo, useState, type ReactNode } from 'react';
import { availableSongs, filterSongs, formatDuration, type SongRow } from '../../lib/domain/setLists';

interface Props {
  songs: readonly SongRow[];
  /** Song ids already in the set; hidden from the pool. */
  onListIds: ReadonlySet<string>;
  onPick: (song: SongRow) => void;
  /** Opens the new-song form (adds to the library, then to the set). */
  onCreate: () => void;
  /** Other add buttons (Break, Note) shown in the same row as the toggle. */
  actions?: ReactNode;
}

/** Shows a filter box only once the pool is big enough to need one. */
const FILTER_THRESHOLD = 12;

/**
 * Toggleable song pool for building a set.
 * @param props see {@link Props}
 * @returns the Song List button and, when open, the pool panel
 */
export default function SongPool({ songs, onListIds, onPick, onCreate, actions }: Props) {
  const uid = useId();
  const panelId = `${uid}-pool`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const pool = useMemo(() => availableSongs(songs, onListIds), [songs, onListIds]);
  const shown = useMemo(() => filterSongs(pool, query), [pool, query]);

  return (
    <div className="sl-pool">
      <div className="sl-pool-bar">
        <button type="button" className="btn btn-primary sl-pool-toggle"
          aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(o => !o)}>
          {open ? 'Hide Song List' : 'Song List'}
          <span className="sl-pool-count" aria-label={`${pool.length} songs available`}>{pool.length}</span>
        </button>
        {actions}
      </div>

      {open && (
        <div id={panelId} className="sl-pool-panel" role="region" aria-label="Song List">
          <div className="sl-pool-head">
            <p className="sl-pool-hint">Tap a song to add it to the set.</p>
            <button type="button" className="btn btn-ghost btn-sm" onClick={onCreate}>+ New song</button>
          </div>

          {pool.length > FILTER_THRESHOLD && (
            <>
              <label className="sr-only" htmlFor={`${uid}-filter`}>Filter songs</label>
              <input id={`${uid}-filter`} className="input sl-pool-filter" type="search"
                placeholder="Filter (optional)" autoComplete="off"
                value={query} onChange={e => setQuery(e.target.value)} />
            </>
          )}

          {songs.length === 0 ? (
            <p className="sl-pool-empty">No songs in your library yet. Use “+ New song” to add one.</p>
          ) : pool.length === 0 ? (
            <p className="sl-pool-empty">Every song in your library is in this set.</p>
          ) : shown.length === 0 ? (
            <p className="sl-pool-empty">No songs match “{query.trim()}”.</p>
          ) : (
            <ul className="sl-pool-list">
              {shown.map(s => {
                const meta = [s.song_key, formatDuration(s.duration_sec)].filter(Boolean).join(' · ');
                return (
                  <li key={s.id}>
                    <button type="button" className="sl-pool-song" onClick={() => onPick(s)}
                      aria-label={`Add ${s.title} to the set`}>
                      <span className="sl-pool-title">{s.title}</span>
                      {meta && <span className="sl-pool-meta mono">{meta}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
