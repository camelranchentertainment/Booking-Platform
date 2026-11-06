// components/setlists/SongPicker.tsx
//
// Search-and-add box for the builder. A combobox: type to filter the library,
// Up/Down to move through matches, Enter to add. When nothing matches, Enter
// (or the button) offers to add the typed title to the library first.

import { useId, useMemo, useState, type KeyboardEvent } from 'react';
import { formatDuration, type SongRow } from '../../lib/domain/setLists';

interface Props {
  songs: readonly SongRow[];
  /** Song ids already on the list; shown with a marker but still addable (encores repeat). */
  onListIds: ReadonlySet<string>;
  onPick: (song: SongRow) => void;
  onCreate: (title: string) => void;
}

const MAX_RESULTS = 8;

/** Combobox for adding songs to a set. */
export default function SongPicker({ songs, onListIds, onPick, onCreate }: Props) {
  const uid = useId();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return songs.slice(0, MAX_RESULTS);
    const starts = songs.filter(s => s.title.toLowerCase().startsWith(q));
    const contains = songs.filter(s => !s.title.toLowerCase().startsWith(q)
      && (s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q)));
    return [...starts, ...contains].slice(0, MAX_RESULTS);
  }, [songs, query]);

  const typed = query.trim();
  const canCreate = typed.length > 0 && !songs.some(s => s.title.toLowerCase() === typed.toLowerCase());
  const optionCount = matches.length + (canCreate ? 1 : 0);

  const choose = (index: number): void => {
    if (index < matches.length) {
      onPick(matches[index]);
      setQuery('');
      setActive(0);
    } else if (canCreate) {
      onCreate(typed);
      setQuery('');
      setOpen(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setActive(a => (optionCount ? (a + 1) % optionCount : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setOpen(true);
      setActive(a => (optionCount ? (a - 1 + optionCount) % optionCount : 0));
    } else if (e.key === 'Enter') {
      if (!open || optionCount === 0) return;
      e.preventDefault();
      choose(Math.min(active, optionCount - 1));
    } else if (e.key === 'Escape' && open) {
      e.stopPropagation();
      setOpen(false);
    }
  };

  const listId = `${uid}-list`;
  const optId = (i: number): string => `${uid}-opt-${i}`;
  const showList = open && optionCount > 0;

  return (
    <div className="sl-picker">
      <label className="field-label" htmlFor={`${uid}-input`}>Add a song</label>
      <input
        id={`${uid}-input`}
        className="input"
        type="text"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={showList ? optId(Math.min(active, optionCount - 1)) : undefined}
        placeholder={songs.length ? 'Type a song title, then Enter' : 'Type a title to add your first song'}
        value={query}
        autoComplete="off"
        onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {showList && (
        <ul id={listId} role="listbox" className="sl-picker-list" aria-label="Matching songs">
          {matches.map((s, i) => (
            <li key={s.id} id={optId(i)} role="option" aria-selected={i === active}
              className={`sl-picker-opt${i === active ? ' sl-picker-opt--active' : ''}`}
              // mousedown, not click: fires before the input's blur closes the list.
              onMouseDown={e => { e.preventDefault(); choose(i); }}
              onMouseEnter={() => setActive(i)}>
              <span className="sl-picker-title">{s.title}</span>
              <span className="sl-picker-meta mono">
                {[s.song_key, formatDuration(s.duration_sec)].filter(Boolean).join(' · ')}
                {onListIds.has(s.id) ? ' · on list' : ''}
              </span>
            </li>
          ))}
          {canCreate && (
            <li id={optId(matches.length)} role="option" aria-selected={active === matches.length}
              className={`sl-picker-opt sl-picker-opt--new${active === matches.length ? ' sl-picker-opt--active' : ''}`}
              onMouseDown={e => { e.preventDefault(); choose(matches.length); }}
              onMouseEnter={() => setActive(matches.length)}>
              + Add “{typed}” to your library
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
