// components/setlists/SongPool.tsx
//
// The Song List panel beside the set in the builder. Lists the band's whole
// song library as tap-to-add buttons, so nobody has to type to find a song.
// Songs already in the set drop out and come back if removed from the set.
//
// On wide screens the panel is always open and sticks beside the set. On
// narrow screens (where it stacks above the set) it collapses behind a
// "Song List" button so the set itself stays in view.

import { useId, useMemo, useState } from 'react';
import { availableSongs, filterSongs, formatDuration, type SongRow } from '../../lib/domain/setLists';

interface Props {
  songs: readonly SongRow[];
  /** Song ids already in the set; hidden from the pool. */
  onListIds: ReadonlySet<string>;
  onPick: (song: SongRow) => void;
  /** Opens the new-song form (adds to the library, then to the set). */
  onCreate: () => void;
}

/** Shows a filter box only once the pool is big enough to need one. */
const FILTER_THRESHOLD = 12;

/**
 * Song List panel for building a set.
 * @param props see {@link Props}
 * @returns the panel (with a toggle that only shows on narrow screens)
 */
export default function SongPool({ songs, onListIds, onPick, onCreate }: Props) {
  const uid = useId();
  const bodyId = `${uid}-pool`;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const pool = useMemo(() => availableSongs(songs, onListIds), [songs, onListIds]);
  const shown = useMemo(() => filterSongs(pool, query), [pool, query]);

  return (
    <aside className={`card sl-pool${open ? ' sl-pool--open' : ''}`} aria-labelledby={`${uid}-title`}>
      <div className="sl-pool-head">
        <h2 className="sl-section-title" id={`${uid}-title`}>
          Song List <span className="sl-section-count mono">{pool.length}</span>
        </h2>
        <button type="button" className="btn btn-primary btn-sm sl-pool-toggle"
          aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen(o => !o)}>
          {open ? 'Hide' : 'Show songs'}
        </button>
      </div>

      <div id={bodyId} className="sl-pool-body">
        <p className="sl-pool-hint">Tap a song to add it to the end of the set.</p>

        {pool.length > FILTER_THRESHOLD && (
          <>
            <label className="sr-only" htmlFor={`${uid}-filter`}>Filter songs</label>
            <input id={`${uid}-filter`} className="input sl-pool-filter" type="search"
              placeholder="Filter (optional)" autoComplete="off"
              value={query} onChange={e => setQuery(e.target.value)} />
          </>
        )}

        {songs.length === 0 ? (
          <p className="sl-pool-empty">No songs in your library yet.</p>
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
                    <span className="sl-pool-song-text">
                      <span className="sl-pool-title">{s.title}</span>
                      {s.artist && <span className="sl-pool-artist">{s.artist}</span>}
                    </span>
                    {meta && <span className="sl-pool-meta mono">{meta}</span>}
                    <span className="sl-pool-plus" aria-hidden="true">+</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <button type="button" className="btn btn-ghost btn-sm sl-pool-new" onClick={onCreate}>
          + New song to the library
        </button>
      </div>
    </aside>
  );
}
