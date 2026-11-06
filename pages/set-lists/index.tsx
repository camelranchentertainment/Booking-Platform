// pages/set-lists/index.tsx
//
// Set Lists — the band admin's song library and every set list, grouped as
// Upcoming shows / Templates / Past shows. Opening a set list goes to the
// builder at /set-lists/[id]. Pushing to members' phones lives in the builder.
//
// Data access is in lib/setListQueries.ts (RLS-scoped, signed-in client);
// pure logic is in lib/domain/setLists.ts (unit-tested).

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import AppShell from '../../components/layout/AppShell';
import PageHero from '../../components/layout/PageHero';
import SetListScene from '../../components/setlists/SetListScene';
import SongLibrary from '../../components/setlists/SongLibrary';
import NewSetListModal from '../../components/setlists/NewSetListModal';
import PushStatusChip from '../../components/setlists/PushStatusChip';
import { useModalKeys } from '../../components/venues/useModalKeys';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../lib/supabase';
import {
  archiveSetList, loadSetLists, loadShowsByIds, loadSongs, loadUpcomingShows, showLabel, type ShowOption,
} from '../../lib/setListQueries';
import type { SetListRow, SongRow } from '../../lib/domain/setLists';
import { formatShowDate, localToday } from '../../lib/formatDate';

type Load =
  | { kind: 'loading' }
  | { kind: 'no-band' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; songs: SongRow[]; setLists: SetListRow[]; upcoming: ShowOption[]; showsById: Map<string, ShowOption> };

const showDate = (d: string): string => formatShowDate(d, { weekday: 'short', month: 'short', day: 'numeric' });

/** Loads songs, set lists and the shows they belong to in parallel. */
async function loadAll(actId: string): Promise<Load> {
  const today = localToday();
  const [songs, lists, upcoming] = await Promise.all([
    loadSongs(supabase, actId),
    loadSetLists(supabase, actId),
    loadUpcomingShows(supabase, actId, today),
  ]);
  if (!songs.ok) return { kind: 'error', message: songs.message };
  if (!lists.ok) return { kind: 'error', message: lists.message };
  if (!upcoming.ok) return { kind: 'error', message: upcoming.message };

  const showsById = new Map(upcoming.data.map(s => [s.id, s]));
  const missing = lists.data.map(l => l.booking_id).filter((id): id is string => !!id && !showsById.has(id));
  if (missing.length) {
    const past = await loadShowsByIds(supabase, actId, missing);
    if (!past.ok) return { kind: 'error', message: past.message };
    for (const s of past.data) showsById.set(s.id, s);
  }
  return { kind: 'ready', songs: songs.data, setLists: lists.data, upcoming: upcoming.data, showsById };
}

export default function SetListsPage() {
  const router = useRouter();
  const { profile } = useAuth();
  const actId = profile?.act_id ?? null;
  const [state, setState] = useState<Load>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [creating, setCreating] = useState<{ copyFromId: string | null } | null>(null);
  const [deleting, setDeleting] = useState<SetListRow | null>(null);

  const hasProfile = !!profile;

  useEffect(() => {
    if (!hasProfile) return;
    if (!actId) { setState({ kind: 'no-band' }); return; }
    let cancelled = false;
    setState({ kind: 'loading' });
    void loadAll(actId).then(r => { if (!cancelled) setState(r); });
    return () => { cancelled = true; };
  }, [hasProfile, actId, reloadKey]);

  const retry = useCallback(() => setReloadKey(k => k + 1), []);
  const ready = state.kind === 'ready' ? state : null;

  const groups = useMemo(() => {
    if (!ready) return null;
    const today = localToday();
    const upcoming: SetListRow[] = [];
    const past: SetListRow[] = [];
    const templates: SetListRow[] = [];
    for (const l of ready.setLists) {
      if (!l.booking_id) { templates.push(l); continue; }
      const show = ready.showsById.get(l.booking_id);
      if (show && show.show_date >= today) upcoming.push(l);
      else past.push(l);
    }
    const dateOf = (l: SetListRow): string => (l.booking_id ? ready.showsById.get(l.booking_id)?.show_date : null) ?? '';
    upcoming.sort((a, b) => dateOf(a).localeCompare(dateOf(b)));
    past.sort((a, b) => dateOf(b).localeCompare(dateOf(a)));
    templates.sort((a, b) => a.name.localeCompare(b.name));
    return { upcoming, past, templates };
  }, [ready]);

  const summary = ready
    ? `${ready.songs.length} ${ready.songs.length === 1 ? 'song' : 'songs'} · ${ready.setLists.length} ${ready.setLists.length === 1 ? 'set list' : 'set lists'}`
    : undefined;

  const renderCard = (l: SetListRow) => {
    const show = l.booking_id && ready ? ready.showsById.get(l.booking_id) : undefined;
    return (
      <li key={l.id} className="sl-card">
        <div className="sl-card-head">
          <Link href={`/set-lists/${l.id}`} className="sl-card-name">{l.name}</Link>
          <PushStatusChip row={l} />
        </div>
        <p className="sl-card-sub">
          {show ? <>{showDate(show.show_date)} · {showLabel(show)}</> : l.booking_id ? 'Show no longer available' : 'Template'}
        </p>
        <div className="sl-card-actions">
          <Link href={`/set-lists/${l.id}`} className="btn btn-secondary btn-sm">Open</Link>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCreating({ copyFromId: l.id })}
            aria-label={`Duplicate ${l.name}`}>Duplicate</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDeleting(l)}
            aria-label={`Delete ${l.name}`}>Delete</button>
        </div>
      </li>
    );
  };

  const section = (title: string, rows: SetListRow[], empty: string) => (
    <section className="sl-group" aria-label={title}>
      <h3 className="sl-group-title">{title} <span className="sl-group-count">{rows.length}</span></h3>
      {rows.length ? <ul className="sl-card-list">{rows.map(renderCard)}</ul> : <p className="sl-muted">{empty}</p>}
    </section>
  );

  return (
    <AppShell requireRole="band_admin">
      <PageHero
        title="Set Lists"
        subtitle="Build it once · it’s on every phone"
        summary={summary}
        scene={<SetListScene />}
        actions={ready ? (
          <button type="button" className="btn btn-primary tours-new-btn" onClick={() => setCreating({ copyFromId: null })}>
            + New set list
          </button>
        ) : undefined}
      />

      {state.kind === 'loading' && (
        <div className="sl-layout" aria-busy="true">
          <span className="sr-only" role="status">Loading set lists…</span>
          <div className="tour-skeleton tour-skeleton--card sl-skeleton" />
          <div className="tour-skeleton tour-skeleton--card sl-skeleton" />
        </div>
      )}

      {state.kind === 'error' && (
        <div className="card tours-empty" role="alert">
          <div className="tours-empty-title">Set lists didn’t load</div>
          <p>{state.message} Your songs and set lists are safe — try again.</p>
          <button type="button" className="btn btn-primary" onClick={retry}>Try again</button>
        </div>
      )}

      {state.kind === 'no-band' && (
        <div className="card tours-empty">
          <div className="tours-empty-title">No band yet</div>
          <p>Set up your band first, then your songs and set lists live here.</p>
        </div>
      )}

      {ready && actId && groups && (
        <div className="sl-layout">
          <SongLibrary actId={actId} songs={ready.songs}
            onChange={songs => setState({ ...ready, songs })} />

          <section className="card sl-panel" aria-labelledby="sl-lists-title">
            <div className="sl-panel-head">
              <div>
                <h2 className="sl-panel-title" id="sl-lists-title">Set lists</h2>
                <p className="sl-panel-sub">Open one to build it and push it to the band.</p>
              </div>
            </div>
            {ready.setLists.length === 0 ? (
              <div className="sl-empty">
                <p className="sl-empty-title">No set lists yet</p>
                <p>Make one for your next show, or a template you can copy for every night of a run.</p>
                <button type="button" className="btn btn-secondary" onClick={() => setCreating({ copyFromId: null })}>
                  Make your first set list
                </button>
              </div>
            ) : (
              <>
                {section('Upcoming shows', groups.upcoming, 'No set lists for upcoming shows yet.')}
                {section('Templates', groups.templates, 'No templates yet. A template is a set you reuse — copy it for each show.')}
                {groups.past.length > 0 && section('Past shows', groups.past, '')}
              </>
            )}
          </section>
        </div>
      )}

      {creating && ready && actId && (
        <NewSetListModal actId={actId} shows={ready.upcoming} setLists={ready.setLists} copyFromId={creating.copyFromId}
          onClose={() => setCreating(null)}
          onCreated={row => { setCreating(null); void router.push(`/set-lists/${row.id}`); }} />
      )}

      {deleting && actId && (
        <DeleteSetListDialog actId={actId} row={deleting} onClose={() => setDeleting(null)}
          onDeleted={() => { setDeleting(null); retry(); }} />
      )}
    </AppShell>
  );
}

interface DeleteProps {
  actId: string;
  row: SetListRow;
  onClose: () => void;
  onDeleted: () => void;
}

function DeleteSetListDialog({ actId, row, onClose, onDeleted }: DeleteProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useModalKeys<HTMLDivElement>(busy ? () => undefined : onClose);
  const pushed = row.published_version > 0;

  const confirm = async (): Promise<void> => {
    setBusy(true);
    setError('');
    const res = await archiveSetList(supabase, actId, row.id);
    setBusy(false);
    if (!res.ok) { setError(res.message); return; }
    onDeleted();
  };

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal sl-modal sl-modal--narrow" role="alertdialog" aria-modal="true"
        aria-labelledby="sl-del-title" aria-describedby="sl-del-desc">
        <div className="modal-header">
          <h2 className="modal-title" id="sl-del-title">Delete set list?</h2>
        </div>
        <div id="sl-del-desc" className="sl-form">
          <p>Delete <strong>{row.name}</strong>?{pushed ? ' Members will no longer see it on their phones.' : ''}</p>
          {error && <p className="sl-error" role="alert">{error}</p>}
        </div>
        <div className="sl-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Keep it</button>
          <button type="button" className="btn btn-danger" onClick={() => void confirm()} disabled={busy} aria-busy={busy}>
            {busy ? 'Deleting…' : 'Delete set list'}
          </button>
        </div>
      </div>
    </div>
  );
}
