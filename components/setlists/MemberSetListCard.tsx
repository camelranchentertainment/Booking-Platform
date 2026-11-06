// components/setlists/MemberSetListCard.tsx
//
// The set list a member sees on their show page: the last version the band
// admin pushed (set_lists.published_snapshot), never the admin's draft. RLS
// lets a member read only pushed set lists for their own band.

import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatDuration, parseSnapshot, songNumbers, type SetListSnapshot } from '../../lib/domain/setLists';

type State =
  | { kind: 'loading' }
  | { kind: 'none' }
  | { kind: 'error' }
  | { kind: 'ready'; snapshot: SetListSnapshot; publishedAt: string | null };

const when = (iso: string): string =>
  new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** Read-only set list card for one show. */
export default function MemberSetListCard({ bookingId }: { bookingId: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('set_lists')
        .select('published_snapshot, published_at')
        .eq('booking_id', bookingId)
        .is('deleted_at', null)
        .not('published_snapshot', 'is', null)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        console.error('[member set list] load failed', { code: error.code });
        setState({ kind: 'error' });
        return;
      }
      const snapshot = parseSnapshot((data as { published_snapshot: unknown } | null)?.published_snapshot);
      if (!snapshot) { setState({ kind: 'none' }); return; }
      setState({ kind: 'ready', snapshot, publishedAt: (data as { published_at: string | null }).published_at });
    })();
    return () => { cancelled = true; };
  }, [bookingId, reloadKey]);

  const numbers = state.kind === 'ready' ? songNumbers(state.snapshot.items.map(i => ({ item_type: i.type }))) : [];
  return (
    <section className="card" aria-labelledby="member-setlist-title">
      <div className="card-header">
        <h2 className="card-title" id="member-setlist-title">SET LIST</h2>
      </div>

      {state.kind === 'loading' && <p className="sl-muted" role="status">Loading the set list…</p>}
      {state.kind === 'none' && <p className="sl-muted">No set list yet. You’ll get a notification when the band admin sends one.</p>}
      {state.kind === 'error' && (
        <div role="alert" className="sl-member-error">
          <p className="sl-muted">The set list didn’t load.</p>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setState({ kind: 'loading' }); setReloadKey(k => k + 1); }}>
            Try again
          </button>
        </div>
      )}

      {state.kind === 'ready' && (
        <>
          <div className="sl-member-head">
            <span className="sl-member-name">{state.snapshot.name}</span>
            <span className="sl-muted">
              Version {state.snapshot.version}{state.publishedAt ? ` · updated ${when(state.publishedAt)}` : ''}
            </span>
          </div>
          {state.snapshot.notes && <p className="sl-member-notes">{state.snapshot.notes}</p>}
          {state.snapshot.items.length === 0 ? (
            <p className="sl-muted">This set list is empty.</p>
          ) : (
            <ol className="sl-member-list">
              {state.snapshot.items.map((item, idx) => {
                if (item.type === 'break') {
                  return <li key={idx} className="sl-member-break">{item.title}</li>;
                }
                if (item.type === 'note') {
                  return (
                    <li key={idx} className="sl-member-note">
                      {item.title}{item.notes ? ` — ${item.notes}` : ''}
                    </li>
                  );
                }
                const n = numbers[idx];
                const detail = [item.key, item.bpm ? `${item.bpm} bpm` : null, formatDuration(item.duration_sec) || null].filter(Boolean).join(' · ');
                const notes = [item.notes, item.song_notes].filter(Boolean).join(' · ');
                return (
                  <li key={idx} className="sl-member-song">
                    <span className="sl-member-num mono" aria-hidden="true">{n}</span>
                    <div className="sl-member-song-body">
                      <span className="sl-member-song-title">
                        <span className="sr-only">Song {n}: </span>{item.title}
                      </span>
                      {detail && <span className="sl-member-song-meta mono">{detail}</span>}
                      {notes && <span className="sl-member-song-notes">{notes}</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
