// components/dashboard/AssistantHistoryList.tsx
// The list of past assistant chats shown inside the chat panel on /band.
// Each day is one button; picking it opens that day's saved chat (read-only).

import React from 'react';
import { formatShowDate } from '../../lib/formatDate';
import type { ConversationDaySummary } from '../../lib/agentConversationDays';

type Props = {
  /** Past days, newest first, today already removed. */
  days: ConversationDaySummary[];
  loading: boolean;
  error: string;
  /** Opens one day's saved chat. */
  onOpen: (day: string) => void;
  /** Reloads the list after an error. */
  onRetry: () => void;
};

const HEADING_STYLE: React.CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  margin: 0,
};

const ROW_STYLE: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-start',
  gap: 2,
  width: '100%',
  minHeight: 44, // touch target
  padding: '0.55rem 0.8rem',
  background: 'var(--bg-overlay)',
  border: '1px solid var(--border)',
  color: 'var(--text-primary)',
  textAlign: 'left',
  cursor: 'pointer',
  font: 'inherit',
};

/**
 * Renders the History list with loading, error and empty states.
 * Past days are listed newest first with the first question asked that day.
 */
export default function AssistantHistoryList({ days, loading, error, onOpen, onRetry }: Props) {
  if (loading) {
    return (
      <div role="status" style={{ color: 'var(--text-muted)', fontSize: 13, alignSelf: 'center' }}>
        Loading past chats…
      </div>
    );
  }

  if (error) {
    return (
      <div role="alert" style={{ color: '#f87171', fontSize: 13, alignSelf: 'center', textAlign: 'center' }}>
        {error}{' '}
        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>Try again</button>
      </div>
    );
  }

  if (days.length === 0) {
    return (
      <div style={{ alignSelf: 'center', textAlign: 'center', maxWidth: 360, display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
        <p style={HEADING_STYLE}>No past chats yet</p>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          Each day starts with a fresh chat. Once a day has passed, its conversation is saved here so you can look back at it.
        </p>
      </div>
    );
  }

  return (
    <section aria-labelledby="assistant-history-heading" style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', alignSelf: 'stretch' }}>
      <h3 id="assistant-history-heading" style={HEADING_STYLE}>Past chats</h3>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        {days.map(d => (
          <li key={d.day}>
            <button
              type="button"
              style={ROW_STYLE}
              onClick={() => onOpen(d.day)}
              onFocus={e => { e.currentTarget.style.outline = '2px solid var(--accent)'; e.currentTarget.style.outlineOffset = '2px'; }}
              onBlur={e => { e.currentTarget.style.outline = ''; }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
            >
              <span style={{ fontSize: 13, fontWeight: 700 }}>
                {formatShowDate(d.day, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>
                  {' · '}{d.messageCount} message{d.messageCount !== 1 ? 's' : ''}
                </span>
              </span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', overflowWrap: 'anywhere' }}>{d.preview}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
