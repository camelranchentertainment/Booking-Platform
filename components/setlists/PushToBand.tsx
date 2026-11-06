// components/setlists/PushToBand.tsx
//
// "Push to Band" for the builder. Opens a confirm dialog that says exactly who
// will be told (count from GET /api/set-lists/[id]/publish), makes sure every
// edit has saved first, then POSTs to publish. The server notifies the show's
// lineup and sends phone pushes. Pushing twice with no changes is harmless:
// the server reports "nothing changed" and nobody is pinged again.

import { useEffect, useState } from 'react';
import { useModalKeys } from '../venues/useModalKeys';
import { supabase } from '../../lib/supabase';
import { pushStatus, type SetListRow } from '../../lib/domain/setLists';

interface Props {
  header: SetListRow;
  /** Waits for pending edits to save; false when they couldn't be saved. */
  ensureSaved: () => Promise<boolean>;
  /** Called after a successful push so the page can refresh the status chip. */
  onPushed: () => void;
}

type PublishOk = { version: number; changed: boolean; notified: number; pushed: number; pushFailed: number };
type ApiError = { error?: { code?: string; message?: string } };

async function authHeader(): Promise<Record<string, string>> {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

const people = (n: number): string => (n === 1 ? '1 member' : `${n} members`);

/** Button + dialog. Templates show guidance instead of a button. */
export default function PushToBand({ header, ensureSaved, onPushed }: Props) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<string>('');
  const status = pushStatus(header);

  if (header.is_template || !header.booking_id) {
    return <p className="sl-hint">Templates aren’t sent to phones. Copy this to a show, then push that set list.</p>;
  }

  const label = status.kind === 'draft' ? 'Push to band' : status.kind === 'changed' ? 'Push update to band' : 'Band is up to date';

  return (
    <div className="sl-push">
      <button type="button" className="btn btn-primary sl-push-btn" disabled={status.kind === 'pushed'}
        onClick={() => { setResult(''); setOpen(true); }}>
        {label}
      </button>
      <span className="sl-push-result" role="status" aria-live="polite">{result}</span>
      {open && (
        <PushDialog header={header} ensureSaved={ensureSaved} onClose={() => setOpen(false)}
          onDone={(message) => { setOpen(false); setResult(message); onPushed(); }} />
      )}
    </div>
  );
}

interface DialogProps {
  header: SetListRow;
  ensureSaved: () => Promise<boolean>;
  onClose: () => void;
  onDone: (message: string) => void;
}

function PushDialog({ header, ensureSaved, onClose, onDone }: DialogProps) {
  const [count, setCount] = useState<number | null>(null);
  const [countError, setCountError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useModalKeys<HTMLDivElement>(busy ? () => undefined : onClose);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/set-lists/${header.id}/publish`, { headers: await authHeader() });
        const body = (await res.json().catch(() => ({}))) as { data?: { recipients?: number } } & ApiError;
        if (cancelled) return;
        if (!res.ok || typeof body.data?.recipients !== 'number') {
          setCountError(body.error?.message ?? 'Couldn’t check who’s on this show.');
          return;
        }
        setCount(body.data.recipients);
      } catch {
        if (!cancelled) setCountError('Couldn’t reach the server. Check your connection.');
      }
    })();
    return () => { cancelled = true; };
  }, [header.id]);

  const push = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      // Publish freezes what's saved, so unsaved edits must land first.
      if (!(await ensureSaved())) {
        setError('Your latest edits haven’t saved yet. Fix the save problem shown on the page, then push.');
        return;
      }
      const res = await fetch(`/api/set-lists/${header.id}/publish`, { method: 'POST', headers: await authHeader() });
      const body = (await res.json().catch(() => ({}))) as { data?: PublishOk } & ApiError;
      if (!res.ok || !body.data) {
        setError(body.error?.message ?? 'Couldn’t push the set list. Nothing was sent — try again.');
        return;
      }
      const d = body.data;
      if (!d.changed) { onDone('Nothing changed since the last push, so no one was pinged.'); return; }
      const base = d.notified > 0 ? `Pushed version ${d.version} to ${people(d.notified)}.` : `Saved version ${d.version}. No one on this show has an account yet.`;
      onDone(d.pushFailed > 0 ? `${base} ${d.pushFailed} phone notification${d.pushFailed === 1 ? '' : 's'} didn’t go through.` : base);
    } catch {
      setError('Couldn’t reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const isUpdate = header.published_version > 0;

  return (
    <div className="modal-backdrop">
      <div ref={dialogRef} className="modal sl-modal sl-modal--narrow" role="dialog" aria-modal="true"
        aria-labelledby="sl-push-title" aria-describedby="sl-push-desc">
        <div className="modal-header">
          <h2 className="modal-title" id="sl-push-title">{isUpdate ? 'Push update?' : 'Push to band?'}</h2>
        </div>
        <div id="sl-push-desc" className="sl-form">
          {count === null && !countError && <p className="sl-muted" role="status">Checking who’s on this show…</p>}
          {countError && <p className="sl-error" role="alert">{countError}</p>}
          {count !== null && count > 0 && (
            <p>
              Send <strong>{header.name}</strong> to the <strong>{people(count)}</strong> on this show?
              They’ll get a notification on their phone and see it on the show page.
            </p>
          )}
          {count === 0 && (
            <p>
              No one on this show’s lineup has an account yet, so no one will be notified.
              You can still push it — members will see it once they’re added to the show.
            </p>
          )}
          {error && <p className="sl-error" role="alert">{error}</p>}
        </div>
        <div className="sl-modal-actions">
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="btn btn-primary" onClick={() => void push()}
            disabled={busy || (count === null && !countError)} aria-busy={busy}>
            {busy ? 'Pushing…' : isUpdate ? 'Push update' : 'Push to band'}
          </button>
        </div>
      </div>
    </div>
  );
}
