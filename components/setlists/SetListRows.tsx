// components/setlists/SetListRows.tsx
//
// The ordered rows of a set list, reorderable with mouse, touch or keyboard
// (focus a row's ⋮⋮ handle, Space to pick up, Up/Down to move, Space to drop,
// Escape to cancel). dnd-kit announces each move to screen readers.
//
// Songs are numbered; breaks and notes aren't. Key and notes can be changed
// per row without touching the song in the library.

import {
  DndContext, KeyboardSensor, PointerSensor, TouchSensor, closestCenter, useSensor, useSensors,
  type Announcements, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { LIMITS, formatDuration, songNumbers, type BuilderItem, type SongRow } from '../../lib/domain/setLists';

interface Props {
  items: readonly BuilderItem[];
  songsById: ReadonlyMap<string, SongRow>;
  onChange: (items: BuilderItem[]) => void;
}

/** Display title for any row type. */
export function rowTitle(item: BuilderItem, songsById: ReadonlyMap<string, SongRow>): string {
  if (item.item_type === 'song') return (item.song_id && songsById.get(item.song_id)?.title) || 'Song no longer in library';
  return item.label?.trim() || (item.item_type === 'break' ? 'Break' : 'Note');
}

/** Sortable list of set rows. */
export default function SetListRows({ items, songsById, onChange }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // Press-and-hold on phones so normal scrolling still works.
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const positionOf = (id: string | number): number => items.findIndex(i => i.key === id) + 1;
  const nameOf = (id: string | number): string => {
    const item = items.find(i => i.key === id);
    return item ? rowTitle(item, songsById) : 'row';
  };
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${nameOf(active.id)}, position ${positionOf(active.id)} of ${items.length}.`,
    onDragOver: ({ active, over }) => (over ? `${nameOf(active.id)} moved to position ${positionOf(over.id)} of ${items.length}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${nameOf(active.id)} dropped at position ${positionOf(over.id)} of ${items.length}.` : `${nameOf(active.id)} dropped.`),
    onDragCancel: ({ active }) => `Move cancelled. ${nameOf(active.id)} is back at position ${positionOf(active.id)}.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent): void => {
    if (!over || active.id === over.id) return;
    const from = items.findIndex(i => i.key === active.id);
    const to = items.findIndex(i => i.key === over.id);
    if (from < 0 || to < 0) return;
    onChange(arrayMove([...items], from, to));
  };

  const update = (key: string, patch: Partial<BuilderItem>): void =>
    onChange(items.map(i => (i.key === key ? { ...i, ...patch } : i)));
  const remove = (key: string): void => onChange(items.filter(i => i.key !== key));

  if (items.length === 0) {
    return (
      <div className="sl-empty sl-rows-empty">
        <p className="sl-empty-title">This set is empty</p>
        <p>Add songs with the search box above. Add a break between sets, or a note like “thank the bartenders”.</p>
      </div>
    );
  }

  const numbers = songNumbers(items);
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable: 'To move a row, press Space. Use the Up and Down arrow keys to move it, Space to drop it, or Escape to cancel.',
        },
      }}>
      <SortableContext items={items.map(i => i.key)} strategy={verticalListSortingStrategy}>
        <ol className="sl-rows" aria-label="Set list rows">
          {items.map((item, idx) => (
            <SortableRow key={item.key} item={item} number={numbers[idx]}
              song={item.song_id ? songsById.get(item.song_id) : undefined}
              title={rowTitle(item, songsById)} onUpdate={update} onRemove={remove} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

interface RowProps {
  item: BuilderItem;
  number: number | null;
  song: SongRow | undefined;
  title: string;
  onUpdate: (key: string, patch: Partial<BuilderItem>) => void;
  onRemove: (key: string) => void;
}

function SortableRow({ item, number, song, title, onUpdate, onRemove }: RowProps) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: item.key });
  const style = { transform: CSS.Transform.toString(transform), transition };
  const isSong = item.item_type === 'song';
  const missing = isSong && !song;

  return (
    <li ref={setNodeRef} style={style}
      className={`sl-row sl-row--${item.item_type}${isDragging ? ' sl-row--dragging' : ''}${missing ? ' sl-row--missing' : ''}`}>
      <button type="button" ref={setActivatorNodeRef} className="sl-row-handle" aria-label={`Move ${title}`}
        {...attributes} {...listeners}>
        <span aria-hidden="true">⋮⋮</span>
      </button>

      <span className="sl-row-num mono" aria-hidden={number === null}>{number ?? ''}</span>

      <div className="sl-row-body">
        {isSong ? (
          <div className="sl-row-title">
            {title}
            {song?.artist && <span className="sl-row-artist"> · {song.artist}</span>}
          </div>
        ) : (
          <input className="input sl-row-label" aria-label={item.item_type === 'break' ? 'Break label' : 'Note text'}
            value={item.label ?? ''} maxLength={LIMITS.label}
            placeholder={item.item_type === 'break' ? 'Break' : 'Note for the band'}
            onChange={e => onUpdate(item.key, { label: e.target.value })} />
        )}
        <input className="input sl-row-notes" aria-label={`Notes for ${title}`} value={item.notes ?? ''}
          maxLength={LIMITS.itemNotes} placeholder={isSong ? (song?.notes ? `Library note: ${song.notes}` : 'Note for tonight') : 'Extra detail'}
          onChange={e => onUpdate(item.key, { notes: e.target.value })} />
      </div>

      {isSong && (
        <div className="sl-row-meta">
          <input className="input sl-row-key mono" aria-label={`Key for ${title}`} value={item.key_override ?? ''}
            maxLength={LIMITS.key} placeholder={song?.song_key ?? 'Key'}
            onChange={e => onUpdate(item.key, { key_override: e.target.value })} />
          <span className="sl-row-len mono" aria-label={song?.duration_sec ? `Length ${formatDuration(song.duration_sec)}` : 'No length'}>
            {formatDuration(song?.duration_sec) || '—'}
          </span>
        </div>
      )}

      <button type="button" className="btn btn-ghost btn-sm sl-row-remove" onClick={() => onRemove(item.key)}
        aria-label={`Remove ${title} from the set`}>✕</button>
    </li>
  );
}
