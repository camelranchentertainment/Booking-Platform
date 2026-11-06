// __tests__/lib/setLists.test.ts
import {
  parseDuration, formatDuration, setTotals, setLengthFit, pushStatus,
  toSavePayload, itemsFromRows, moveItem, friendlyDbError, songNumbers, parseSnapshot, LIMITS,
  type BuilderItem, type SongRow,
} from '../../lib/domain/setLists';

const song = (id: string, duration_sec: number | null): SongRow => ({
  id, title: id, artist: null, song_key: null, tempo_bpm: null, duration_sec, notes: null, updated_at: '2026-11-06T00:00:00Z',
});

const row = (over: Partial<BuilderItem>): BuilderItem => ({
  key: 'k', item_type: 'song', song_id: 's1', label: null, key_override: null, notes: null, ...over,
});

describe('parseDuration', () => {
  it.each([
    ['3:45', 225], ['03:45', 225], ['0:59', 59], ['1:00:00', 3600], ['1:00:01', undefined],
    ['225', 225], ['  4:00 ', 240],
  ])('reads %p', (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  it('treats blank as no length', () => {
    expect(parseDuration('   ')).toBeNull();
  });

  it.each(['3:75', 'abc', '3.45', '0:00', '0', '99:99:99', '-1', '4000'])('rejects %p', input => {
    expect(parseDuration(input)).toBeUndefined();
  });
});

describe('formatDuration', () => {
  it('formats minutes and hours', () => {
    expect(formatDuration(225)).toBe('3:45');
    expect(formatDuration(59)).toBe('0:59');
    expect(formatDuration(3750)).toBe('1:02:30');
  });
  it('returns empty for missing values', () => {
    expect(formatDuration(null)).toBe('');
    expect(formatDuration(undefined)).toBe('');
    expect(formatDuration(Number.NaN)).toBe('');
  });
});

describe('setTotals', () => {
  const lib = new Map([['s1', song('s1', 200)], ['s2', song('s2', null)], ['s3', song('s3', 100)]]);

  it('counts songs and sums known lengths, ignoring breaks and notes', () => {
    const items = [
      row({ song_id: 's1' }),
      row({ item_type: 'break', song_id: null, label: 'Break' }),
      row({ song_id: 's2' }),
      row({ song_id: 's3' }),
      row({ item_type: 'note', song_id: null, label: 'Thank the bar' }),
    ];
    expect(setTotals(items, lib)).toEqual({ songs: 3, seconds: 300, songsWithoutLength: 1 });
  });

  it('treats a song missing from the library as having no length', () => {
    expect(setTotals([row({ song_id: 'gone' })], lib)).toEqual({ songs: 1, seconds: 0, songsWithoutLength: 1 });
  });
});

describe('setLengthFit', () => {
  it('compares against the booked set length', () => {
    expect(setLengthFit(3600, 60)).toBe('under');
    expect(setLengthFit(3601, 60)).toBe('over');
    expect(setLengthFit(100, null)).toBe('none');
    expect(setLengthFit(100, 0)).toBe('none');
  });
});

describe('pushStatus', () => {
  it('is draft before the first push', () => {
    expect(pushStatus({ published_at: null, published_version: 0, updated_at: '2026-11-06T10:00:00Z' })).toEqual({ kind: 'draft' });
  });
  it('is pushed when nothing changed since the push', () => {
    const at = '2026-11-06T10:00:00.123456+00:00';
    expect(pushStatus({ published_at: at, published_version: 2, updated_at: at })).toEqual({ kind: 'pushed', version: 2, at });
  });
  it('is changed when edited after the push', () => {
    expect(pushStatus({
      published_at: '2026-11-06T10:00:00Z', published_version: 3, updated_at: '2026-11-06T10:05:00Z',
    })).toEqual({ kind: 'changed', version: 3, at: '2026-11-06T10:00:00Z' });
  });
});

describe('toSavePayload', () => {
  it('keeps order and trims text; songs never carry a label', () => {
    const payload = toSavePayload([
      row({ song_id: 's1', key_override: ' G ', notes: '  ', label: 'ignored' }),
      row({ item_type: 'break', song_id: 's9', label: '  ' }),
      row({ item_type: 'note', song_id: null, label: ' Encore if they want it ', key_override: 'A' }),
    ]);
    expect(payload).toEqual([
      { item_type: 'song', song_id: 's1', label: null, key_override: 'G', notes: null },
      { item_type: 'break', song_id: null, label: 'Break', key_override: null, notes: null },
      { item_type: 'note', song_id: null, label: 'Encore if they want it', key_override: null, notes: null },
    ]);
  });

  it('refuses lists longer than the database allows', () => {
    const many = Array.from({ length: LIMITS.items + 1 }, () => row({}));
    expect(() => toSavePayload(many)).toThrow(/at most 200/);
  });
});

describe('itemsFromRows', () => {
  it('sorts by position and keeps the row id as the key', () => {
    const items = itemsFromRows([
      { id: 'b', position: 1, item_type: 'break', song_id: null, label: 'Break', key_override: null, notes: null },
      { id: 'a', position: 0, item_type: 'song', song_id: 's1', label: null, key_override: null, notes: null },
    ]);
    expect(items.map(i => i.key)).toEqual(['a', 'b']);
  });
});

describe('moveItem', () => {
  it('moves up and down', () => {
    expect(moveItem(['a', 'b', 'c'], 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(['a', 'b', 'c'], 0, 1)).toEqual(['b', 'a', 'c']);
  });
  it('returns the same array at the edges', () => {
    const list = ['a', 'b'];
    expect(moveItem(list, 0, -1)).toBe(list);
    expect(moveItem(list, 1, 1)).toBe(list);
  });
});

describe('friendlyDbError', () => {
  it('names duplicate songs and duplicate show set lists', () => {
    expect(friendlyDbError({ code: '23505', message: 'violates unique constraint "songs_act_title_artist_uniq"' }, 'x'))
      .toBe('That song is already in your library.');
    expect(friendlyDbError({ code: '23505', message: 'duplicate key "set_lists_one_per_booking"' }, 'x'))
      .toMatch(/already has a set list/);
  });
  it('passes our own trigger messages through but hides raw constraint text', () => {
    expect(friendlyDbError({ code: '23514', message: 'That show does not belong to this band' }, 'x'))
      .toBe('That show does not belong to this band');
    expect(friendlyDbError({ code: '23514', message: 'new row violates check constraint "songs_title_check"' }, 'x'))
      .toBe('One of the fields is too long or out of range.');
  });
  it('falls back for unknown errors and for no error', () => {
    expect(friendlyDbError({ code: 'XX000', message: 'internal' }, 'Couldn’t save.')).toBe('Couldn’t save.');
    expect(friendlyDbError(null, 'Couldn’t save.')).toBe('Couldn’t save.');
  });
});

describe('songNumbers', () => {
  it('numbers songs only, skipping breaks and notes', () => {
    expect(songNumbers([
      { item_type: 'song' }, { item_type: 'song' }, { item_type: 'break' }, { item_type: 'song' }, { item_type: 'note' },
    ])).toEqual([1, 2, null, 3, null]);
  });
});

describe('parseSnapshot', () => {
  it('reads a published set list in position order', () => {
    const snap = parseSnapshot({
      name: 'Friday set', notes: null, version: 2,
      items: [
        { position: 1, type: 'break', title: 'Break' },
        { position: 0, type: 'song', title: 'Opener', artist: null, key: 'G', bpm: 120, duration_sec: 200, song_notes: 'Capo 2', notes: null },
      ],
    });
    expect(snap?.version).toBe(2);
    expect(snap?.items.map(i => i.title)).toEqual(['Opener', 'Break']);
    expect(snap?.items[0]).toEqual(expect.objectContaining({ key: 'G', song_notes: 'Capo 2' }));
  });

  it('skips unknown rows and fills missing titles', () => {
    const snap = parseSnapshot({ name: 'X', items: [{ type: 'weird' }, null, { position: 0, type: 'song', title: '' }] });
    expect(snap?.items).toEqual([expect.objectContaining({ type: 'song', title: 'Untitled song' })]);
    expect(snap?.version).toBe(1);
  });

  it('returns null for anything that is not a snapshot', () => {
    expect(parseSnapshot(null)).toBeNull();
    expect(parseSnapshot([])).toBeNull();
    expect(parseSnapshot({ name: '', items: [] })).toBeNull();
    expect(parseSnapshot({ name: 'X', items: 'no' })).toBeNull();
  });
});
