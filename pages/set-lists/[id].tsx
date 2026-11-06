// pages/set-lists/[id].tsx
//
// Set List Builder. Admin-only. Edits save automatically (debounced) through
// save_set_list_items(), which replaces the whole ordered list in one database
// transaction. Saves are serialised: while one is in flight, further edits wait
// and go out together, so the database never sees an older order after a newer one.
// A failed save keeps every edit on screen and offers a retry; leaving the page
// with unsaved edits asks first.
//
// Pushing to members' phones comes in the next update; the status chip already
// shows whether members have the latest version.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import PushStatusChip from '../../components/setlists/PushStatusChip';
import SetListRows, { rowTitle } from '../../components/setlists/SetListRows';
import SongPicker from '../../components/setlists/SongPicker';
import SongFormModal from '../../components/setlists/SongFormModal';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  loadItems, loadSetList, loadShowsByIds, loadSongs, saveItems, showLabel, updateSetListHeader, type ShowOption,
} from '../../lib/setListQueries';
import {
  LIMITS, formatDuration, newItemKey, setLengthFit, setTotals, songNumbers,
  type BuilderItem, type SetItemType, type SetListRow, type SongRow,
} from '../../lib/domain/setLists';
import { formatShowDate } from '../../lib/formatDate';

const SAVE_DELAY_MS = 800;

type Load =
  | { kind: 'loading' }
  | { kind: 'not-found' }
  | { kind: 'error'; message: string }
  | { kind: 'ready' };

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved' } | { kind: 'error'; message: string };

export default function SetListBuilderPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const actId = profile?.act_id ?? null;
  const id = typeof router.query.id === 'string' ? router.query.id : null;

  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [header, setHeader] = useState<SetListRow | null>(null);
  const [show, setShow] = useState<ShowOption | null>(null);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [items, setItems] = useState<BuilderItem[]>([]);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [creatingSong, setCreatingSong] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  const [nameError, setNameError] = useState('');

  // Autosave bookkeeping (refs, so the timer and in-flight save see current values).
  const itemsRef = useRef<BuilderItem[]>([]);
  const editSeq = useRef(0);
  const savedSeq = useRef(0);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Load ────────────────────────────────────────────────────────────────
  // No id in the URL, or the account has no band: nothing to load.
  // Depend on "signed in", not the profile object: a profile refresh must never
  // reload the builder and throw away edits that haven't saved yet.
  const hasProfile = !!profile;
  const missingTarget = router.isReady && hasProfile && (!id || !actId);

  useEffect(() => {
    if (!router.isReady || !hasProfile || !id || !actId) return;
    let cancelled = false;
    void (async () => {
      const [h, lib, rows] = await Promise.all([
        loadSetList(supabase, actId, id), loadSongs(supabase, actId), loadItems(supabase, id),
      ]);
      if (cancelled) return;
      if (!h.ok) { setLoad({ kind: 'error', message: h.message }); return; }
      if (!h.data) { setLoad({ kind: 'not-found' }); return; }
      if (!lib.ok) { setLoad({ kind: 'error', message: lib.message }); return; }
      if (!rows.ok) { setLoad({ kind: 'error', message: rows.message }); return; }
      let showRow: ShowOption | null = null;
      if (h.data.booking_id) {
        const s = await loadShowsByIds(supabase, actId, [h.data.booking_id]);
        if (cancelled) return;
        if (s.ok) showRow = s.data[0] ?? null;
      }
      setHeader(h.data);
      setNameDraft(h.data.name);
      setShow(showRow);
      setSongs(lib.data);
      setItems(rows.data);
      itemsRef.current = rows.data;
      editSeq.current = 0;
      savedSeq.current = 0;
      setSave({ kind: 'idle' });
      setLoad({ kind: 'ready' });
    })();
    return () => { cancelled = true; };
  }, [router.isReady, hasProfile, actId, id, reloadKey]);

  // ── Autosave ────────────────────────────────────────────────────────────
  const flush = useCallback(async (): Promise<void> => {
    if (!id || !actId) return;
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
    // One save at a time; the running loop picks up edits made meanwhile.
    if (inFlight.current || savedSeq.current === editSeq.current) return;

    inFlight.current = true;
    try {
      while (savedSeq.current !== editSeq.current) {
        const seq = editSeq.current;
        setSave({ kind: 'saving' });
        const res = await saveItems(supabase, id, itemsRef.current);
        if (!res.ok) { setSave({ kind: 'error', message: res.message }); return; }
        savedSeq.current = seq;
      }
    } finally {
      inFlight.current = false;
    }
    setSave({ kind: 'saved' });
    // Refresh the header so the push status reflects the save.
    const h = await loadSetList(supabase, actId, id);
    if (h.ok && h.data) setHeader(h.data);
  }, [id, actId]);

  const changeItems = useCallback((next: BuilderItem[]): void => {
    if (next.length > LIMITS.items) {
      setSave({ kind: 'error', message: `A set list can have at most ${LIMITS.items} rows.` });
      return;
    }
    itemsRef.current = next;
    setItems(next);
    editSeq.current += 1;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush(); }, SAVE_DELAY_MS);
  }, [flush]);

  // Save anything pending when leaving the page; warn on tab close if unsaved.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent): void => {
      if (savedSeq.current !== editSeq.current || inFlight.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
      if (savedSeq.current !== editSeq.current) void flush();
    };
  }, [flush]);

  // ── Derived ─────────────────────────────────────────────────────────────
  const songsById = useMemo(() => new Map(songs.map(s => [s.id, s])), [songs]);
  const onListIds = useMemo(
    () => new Set(items.map(i => i.song_id).filter((x): x is string => !!x)),
    [items],
  );
  const totals = setTotals(items, songsById);
  const numbers = useMemo(() => songNumbers(items), [items]);
  const fit = setLengthFit(totals.seconds, show?.set_length_min);

  const addRow = (type: SetItemType, song?: SongRow): void => {
    changeItems([...itemsRef.current, {
      key: newItemKey(),
      item_type: type,
      song_id: song?.id ?? null,
      label: type === 'break' ? 'Break' : null,
      key_override: null,
      notes: null,
    }]);
  };

  const saveName = async (): Promise<void> => {
    if (!header || !actId) return;
    const name = nameDraft.trim();
    if (!name) { setNameError('Give the set list a name.'); return; }
    if (name === header.name) { setNameError(''); return; }
    const res = await updateSetListHeader(supabase, actId, header.id, { name });
    if (!res.ok) { setNameError(res.message); return; }
    setNameError('');
    setHeader(res.data);
  };

  const print = (): void => {
    document.body.classList.add('sl-printing');
    const done = (): void => {
      document.body.classList.remove('sl-printing');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
  };

  // ── Render ──────────────────────────────────────────────────────────────
  const saveLabel = save.kind === 'saving' ? 'Saving…' : save.kind === 'saved' ? 'All changes saved' : '';

  return (
    <AppShell requireRole="band_admin">
      <nav className="sl-crumbs" aria-label="Breadcrumb">
        <Link href="/set-lists">← Set lists</Link>
      </nav>

      {load.kind === 'loading' && !missingTarget && (
        <div aria-busy="true">
          <span className="sr-only" role="status">Loading set list…</span>
          <div className="tour-skeleton tour-skeleton--card sl-skeleton" />
        </div>
      )}

      {load.kind === 'error' && (
        <div className="card tours-empty" role="alert">
          <div className="tours-empty-title">This set list didn’t load</div>
          <p>{load.message}</p>
          <button type="button" className="btn btn-primary" onClick={() => { setLoad({ kind: 'loading' }); setReloadKey(k => k + 1); }}>Try again</button>
        </div>
      )}

      {(load.kind === 'not-found' || missingTarget) && (
        <div className="card tours-empty">
          <div className="tours-empty-title">Set list not found</div>
          <p>It may have been deleted, or it belongs to another band.</p>
          <Link href="/set-lists" className="btn btn-primary">Back to set lists</Link>
        </div>
      )}

      {load.kind === 'ready' && !missingTarget && header && actId && (
        <>
          <header className="card sl-builder-head">
            <div className="sl-builder-title-row">
              <div className="field sl-name-field">
                <label className="sr-only" htmlFor="sl-name">Set list name</label>
                <input id="sl-name" className="sl-name-input" value={nameDraft} maxLength={LIMITS.setName}
                  onChange={e => setNameDraft(e.target.value)} onBlur={() => void saveName()}
                  onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                  aria-invalid={!!nameError} aria-describedby={nameError ? 'sl-name-err' : undefined} />
                {nameError && <span id="sl-name-err" className="sl-field-error" role="alert">{nameError}</span>}
              </div>
              <PushStatusChip row={header} />
            </div>

            <p className="sl-builder-sub">
              {show
                ? <>{formatShowDate(show.show_date, { weekday: 'long', month: 'long', day: 'numeric' })} · {showLabel(show)}</>
                : header.is_template ? 'Template — copy it for any show' : 'Show no longer available'}
            </p>

            <div className="sl-builder-stats">
              <span className="sl-stat"><strong className="mono">{totals.songs}</strong> {totals.songs === 1 ? 'song' : 'songs'}</span>
              <span className={`sl-stat${fit === 'over' ? ' sl-stat--over' : ''}`}>
                <strong className="mono">{formatDuration(totals.seconds) || '0:00'}</strong>
                {show?.set_length_min ? ` of ${show.set_length_min} min` : ' running time'}
                {fit === 'over' && ' — over the booked set'}
              </span>
              {totals.songsWithoutLength > 0 && (
                <span className="sl-stat sl-muted">
                  {totals.songsWithoutLength} {totals.songsWithoutLength === 1 ? 'song has' : 'songs have'} no length
                </span>
              )}
              <span className="sl-save-state" role="status" aria-live="polite">{saveLabel}</span>
              <button type="button" className="btn btn-secondary btn-sm sl-print-btn" onClick={print}>Print</button>
            </div>

            {save.kind === 'error' && (
              <div className="sl-save-error" role="alert">
                <span>{save.message} Your edits are still here.</span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void flush()}>Retry save</button>
              </div>
            )}
          </header>

          <section className="card sl-builder" aria-label="Build the set">
            <div className="sl-add-bar">
              <SongPicker songs={songs} onListIds={onListIds}
                onPick={s => addRow('song', s)} onCreate={title => setCreatingSong(title)} />
              <div className="sl-add-buttons">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => addRow('break')}>+ Break</button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => addRow('note')}>+ Note</button>
              </div>
            </div>
            <SetListRows items={items} songsById={songsById} onChange={changeItems} />
          </section>

          {/* Print-only sheet: big type, one per stage position. */}
          <div className="sl-print-sheet" aria-hidden="true">
            <h1>{header.name}</h1>
            {show && <p>{formatShowDate(show.show_date, { weekday: 'short', month: 'short', day: 'numeric' })} · {showLabel(show)}</p>}
            <ol>
              {items.map((i, idx) => {
                if (i.item_type === 'song') {
                  const s = i.song_id ? songsById.get(i.song_id) : undefined;
                  const key = i.key_override?.trim() || s?.song_key || '';
                  return <li key={i.key} className="sl-print-song"><span>{numbers[idx]}.</span> {rowTitle(i, songsById)}{key ? <em> ({key})</em> : null}</li>;
                }
                return <li key={i.key} className={`sl-print-${i.item_type}`}>{rowTitle(i, songsById)}</li>;
              })}
            </ol>
          </div>

          {creatingSong !== null && (
            <SongFormModal actId={actId} initialTitle={creatingSong} onClose={() => setCreatingSong(null)}
              onSaved={song => {
                setSongs(prev => [...prev, song].sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' })));
                addRow('song', song);
              }} />
          )}
        </>
      )}
    </AppShell>
  );
}
