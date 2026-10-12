// components/booker/MessageHistory.tsx
// The emails an agent has sent about one venue, band or show, newest first.
// Each row expands to the full message; open follow-ups can be marked done.

import { useState } from 'react';
import { setFollowupDone } from '../../lib/booker/data';
import { formatShowDate, todayIso } from '../../lib/booker/dates';
import type { BookerMessage } from '../../lib/booker/types';

function sentLabel(m: BookerMessage, year: number): string {
  const iso = (m.sent_at ?? m.created_at).slice(0, 10);
  return formatShowDate(iso, year);
}

export default function MessageHistory({ messages, onChanged, emptyText = 'No emails sent yet.' }: { messages: BookerMessage[]; onChanged: () => void; emptyText?: string }) {
  const today = todayIso();
  const year = Number(today.slice(0, 4));
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');

  const toggleDone = async (m: BookerMessage) => {
    setBusy(m.id);
    setError('');
    try {
      await setFollowupDone(m.id, !m.followup_done_at);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the follow-up.');
    } finally {
      setBusy(null);
    }
  };

  if (messages.length === 0) return <p className="text-sm text-muted" style={{ margin: 0 }}>{emptyText}</p>;

  return (
    <>
      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--red)', marginTop: 0 }}>
          {error}
        </p>
      )}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
        {messages.map(m => {
          const expanded = open === m.id;
          const due = m.followup_on && !m.followup_done_at && m.status === 'sent';
          const overdue = due && m.followup_on! <= today;
          return (
            <li key={m.id} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--surface-2)' }}>
              <button
                type="button"
                onClick={() => setOpen(expanded ? null : m.id)}
                aria-expanded={expanded}
                style={{ all: 'unset', boxSizing: 'border-box', cursor: 'pointer', display: 'flex', width: '100%', justifyContent: 'space-between', gap: '0.75rem', padding: '0.65rem 0.85rem' }}
              >
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', color: 'var(--text)', fontWeight: 800, overflowWrap: 'anywhere' }}>{m.subject}</span>
                  <span className="text-xs text-muted" style={{ display: 'block' }}>
                    {sentLabel(m, year)} · to {m.to_name ? `${m.to_name} <${m.to_email}>` : m.to_email}
                  </span>
                </span>
                <span style={{ display: 'flex', gap: '0.35rem', alignItems: 'center', flexShrink: 0 }}>
                  {m.status === 'failed' && <span className="badge badge-cancelled">Not sent</span>}
                  {due && <span className={`badge ${overdue ? 'badge-hold' : 'badge-negotiation'}`}>Follow up {formatShowDate(m.followup_on!, year)}</span>}
                  {m.followup_done_at && <span className="badge badge-completed">Followed up</span>}
                  <span aria-hidden="true" className="text-muted">
                    {expanded ? '▴' : '▾'}
                  </span>
                </span>
              </button>
              {expanded && (
                <div style={{ padding: '0 0.85rem 0.8rem', borderTop: '1px solid var(--border)' }}>
                  {m.status === 'failed' && m.error && (
                    <p className="text-sm" style={{ color: 'var(--red)', margin: '0.6rem 0 0' }}>
                      {m.error}
                    </p>
                  )}
                  <p style={{ whiteSpace: 'pre-wrap', margin: '0.6rem 0 0', color: 'var(--text)', fontSize: '0.88rem', lineHeight: 1.55 }}>{m.body}</p>
                  {m.followup_on && m.status === 'sent' && (
                    <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: '0.6rem', paddingLeft: 0 }} onClick={() => toggleDone(m)} disabled={busy === m.id} aria-busy={busy === m.id}>
                      {m.followup_done_at ? 'Reopen follow-up' : '✓ Mark followed up'}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </>
  );
}
