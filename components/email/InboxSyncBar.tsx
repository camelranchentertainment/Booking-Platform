// components/email/InboxSyncBar.tsx
//
// Always-visible status strip at the top of the Email page. Replaces the small
// "↻ Sync Inbox" button that was easy to miss. It tells the admin, in plain
// words, that the inbox checks Gmail by itself, when it last checked, what that
// check found, and gives a large "Check Gmail now" button for impatience.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  INBOX_AUTO_SYNC_INTERVAL_MS,
  syncInboxNow,
  useInboxSync,
  type InboxSyncState,
} from '../../lib/inboxSync';

const RELATIVE_TICK_MS = 15_000;

function relativeTime(at: number | null, now: number): string {
  if (!at) return 'not yet';
  // `now` ticks every 15 s, so a just-finished check can be newer than `now`; clamp.
  const secs = Math.max(0, Math.round((Math.max(now, at) - at) / 1000));
  if (secs < 20) return 'just now';
  if (secs < 60) return `${secs} sec ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs} hr ago`;
}

function intervalLabel(): string {
  const mins = INBOX_AUTO_SYNC_INTERVAL_MS / 60_000;
  return Number.isInteger(mins) ? `${mins} min` : `${mins.toFixed(1).replace('.5', '½')} min`;
}

interface Tone {
  dot: string;
  label: string;
}

function toneFor(s: InboxSyncState): Tone {
  switch (s.status) {
    case 'syncing':       return { dot: 'var(--orange)',     label: 'Checking Gmail…' };
    case 'error':         return { dot: 'var(--red)',        label: 'Last check failed' };
    case 'not_connected': return { dot: 'var(--text-muted)', label: 'Gmail not connected' };
    case 'disabled':      return { dot: 'var(--text-muted)', label: 'Auto-check off' };
    default:              return { dot: 'var(--green)',      label: 'Inbox auto-checks Gmail' };
  }
}

function resultLine(s: InboxSyncState): string | null {
  if (s.status === 'error') return s.errorMessage;
  if (s.status === 'not_connected') return 'New venue replies can’t come in until Gmail is connected.';
  if (s.status === 'disabled') return 'Only Band Admins can pull mail from Gmail.';
  if (!s.lastCheckedAt) return null;

  const parts: string[] = [];
  parts.push(
    s.lastImported > 0
      ? `${s.lastImported} new message${s.lastImported === 1 ? '' : 's'} pulled in`
      : 'No new venue replies',
  );
  if (s.lastUnmatched > 0) {
    parts.push(
      `${s.lastUnmatched} other email${s.lastUnmatched === 1 ? '' : 's'} left in Gmail (sender isn’t a saved venue or contact)`,
    );
  }
  return parts.join(' · ');
}

export default function InboxSyncBar() {
  const sync = useInboxSync();
  const [now, setNow] = useState(() => Date.now());

  // Re-render the "x min ago" text without touching the store.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), RELATIVE_TICK_MS);
    return () => clearInterval(id);
  }, []);

  const tone = toneFor(sync);
  const syncing = sync.status === 'syncing';
  const detail = resultLine(sync);
  const showConnect = sync.status === 'not_connected' || (sync.status === 'error' && /Reconnect Gmail/.test(sync.errorMessage || ''));

  return (
    <section
      aria-label="Gmail inbox status"
      className="card"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '1rem',
        flexWrap: 'wrap',
        padding: '0.85rem 1.1rem',
        marginBottom: '1.25rem',
        borderLeft: `4px solid ${tone.dot}`,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', minWidth: 0, flex: '1 1 280px' }}>
        <span
          aria-hidden="true"
          className={syncing ? 'inbox-sync-dot inbox-sync-dot--busy' : 'inbox-sync-dot'}
          style={{ background: tone.dot }}
        />
        <div style={{ minWidth: 0 }}>
          {/* role=status + aria-live: screen readers hear check results without focus moving */}
          <div role="status" aria-live="polite" style={{ fontWeight: 800, fontSize: '0.92rem', color: 'var(--text-primary)' }}>
            {tone.label}
            {sync.status === 'idle' && (
              <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                {' '}every {intervalLabel()} · last checked {relativeTime(sync.lastCheckedAt, now)}
              </span>
            )}
            {sync.status === 'error' && sync.lastCheckedAt && (
              <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>
                {' '}· last good check {relativeTime(sync.lastCheckedAt, now)}
              </span>
            )}
          </div>
          {detail && (
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.2rem', lineHeight: 1.45 }}>
              {detail}
            </div>
          )}
        </div>
      </div>

      {showConnect ? (
        <Link href="/settings" className="btn btn-primary" style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center' }}>
          Connect Gmail
        </Link>
      ) : (
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => { void syncInboxNow(); }}
          disabled={syncing || sync.status === 'disabled'}
          aria-busy={syncing}
          style={{ minHeight: 44, minWidth: 170 }}
        >
          {syncing ? 'Checking…' : '↻ Check Gmail now'}
        </button>
      )}

    </section>
  );
}
