// components/band/AgentRequests.tsx
// "Requests from your agent" on the band home (build list item 3).
//
// Confirmed shows the band's linked Booking Agent sent over. Nothing reaches
// the band's calendar until the Band Admin clicks Add to calendar; the
// database then creates the booking as that admin. Shows only what the agent
// chose to share. Renders nothing for bands with no agent requests, and the
// database returns nothing to members.

import { useState } from 'react';
import Link from 'next/link';
import styles from '../../styles/dashboard.module.css';
import { formatShowDate, formatTime } from '../../lib/booker/dates';
import { dealLine, type AgentRequest } from '../../lib/booker/handoff';
import { acceptAgentRequest, declineAgentRequest, listAgentRequests } from '../../lib/booker/handoffData';
import { useLoad } from '../../lib/booker/useLoad';
import { BookerDataError } from '../../lib/booker/data';

/** The requests, treating "the database functions aren't installed yet" as none. */
async function loadRequests(): Promise<AgentRequest[]> {
  try {
    return await listAgentRequests();
  } catch (err) {
    if (err instanceof BookerDataError && err.code === 'PGRST202') return [];
    throw err;
  }
}

const money = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 === 0 ? 0 : 2 }).format(n);

interface Props {
  /** Called after a show is added so the page can refresh its calendar figures */
  onAdded?: () => void;
}

export default function AgentRequests({ onAdded }: Props) {
  const { data, loading, error, reload } = useLoad(loadRequests);
  const year = new Date().getFullYear();

  // Quiet when there is nothing from an agent: most bands have none.
  if (loading && !data) return null;
  if (error) {
    return (
      <section className={styles.section} aria-labelledby="agent-requests-h" id="agent-requests">
        <header className={styles.sectionHead}>
          <h2 className={styles.sectionTitle} id="agent-requests-h">
            Requests from your agent
          </h2>
        </header>
        <div role="alert" className="card" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', borderColor: 'rgba(240,104,95,0.5)' }}>
          <span className="text-sm" style={{ color: 'var(--text)', fontWeight: 700 }}>
            {error}
          </span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reload()}>
            Try again
          </button>
        </div>
      </section>
    );
  }
  if (!data || data.length === 0) return null;

  const pending = data.filter(r => r.status === 'pending');
  const answered = data.filter(r => r.status !== 'pending').slice(0, 5);

  return (
    <section className={styles.section} aria-labelledby="agent-requests-h" id="agent-requests">
      <header className={styles.sectionHead}>
        <h2 className={styles.sectionTitle} id="agent-requests-h">
          Requests from your agent
        </h2>
        <Link href="/settings#booking-agent" className={styles.viewAll}>
          Agent settings →
        </Link>
      </header>
      {pending.length === 0 ? (
        <p className="text-sm text-muted" style={{ margin: 0 }}>
          Nothing waiting. Shows your agent sends appear here for you to add to your calendar.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.6rem' }}>
          {pending.map(r => (
            <RequestCard
              key={r.proposal_id}
              request={r}
              year={year}
              onDone={added => {
                void reload();
                if (added) onAdded?.();
              }}
            />
          ))}
        </ul>
      )}
      {answered.length > 0 && (
        <details>
          <summary className="text-sm text-muted" style={{ cursor: 'pointer', minHeight: 44, display: 'flex', alignItems: 'center' }}>
            Answered in the last 30 days · {answered.length}
          </summary>
          <ul style={{ listStyle: 'none', margin: '0.4rem 0 0', padding: 0, display: 'grid', gap: '0.35rem' }}>
            {answered.map(r => (
              <li key={r.proposal_id} className="agent-handoff-row">
                <span>
                  <strong>{formatShowDate(r.payload.show_date, year)}</strong> · {r.payload.venue_name ?? 'Venue'}
                </span>
                <span className={`badge ${r.status === 'accepted' ? 'badge-confirmed' : 'badge-cancelled'}`}>
                  {r.status === 'accepted' ? 'Added' : r.status === 'declined' ? 'Declined' : 'Withdrawn by agent'}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function RequestCard({ request: r, year, onDone }: { request: AgentRequest; year: number; onDone: (added: boolean) => void }) {
  const [busy, setBusy] = useState<'accept' | 'decline' | null>(null);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const p = r.payload;
  const town = [p.venue_city, p.venue_state].filter(Boolean).join(', ');
  const times = [
    p.load_in_time ? `Load-in ${formatTime(p.load_in_time)}` : null,
    p.door_time ? `Doors ${formatTime(p.door_time)}` : null,
    p.set_time ? `Set ${formatTime(p.set_time)}${p.set_length_min ? ` (${p.set_length_min} min)` : ''}` : null,
  ].filter(Boolean);
  const deal = dealLine(p, money);
  const commission =
    p.commission_pct !== undefined
      ? `Agent commission ${p.commission_pct}%${p.commission_amount !== undefined ? ` (${money(Number(p.commission_amount))})` : ''}`
      : null;
  const noteId = `decline-note-${r.proposal_id}`;

  const act = async (kind: 'accept' | 'decline') => {
    setBusy(kind);
    setError('');
    try {
      if (kind === 'accept') await acceptAgentRequest(r.proposal_id);
      else await declineAgentRequest(r.proposal_id, note);
      onDone(kind === 'accept');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setBusy(null);
    }
  };

  return (
    <li className="card" style={{ display: 'grid', gap: '0.6rem', padding: '1rem 1.1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'baseline' }}>
        <div style={{ minWidth: 0 }}>
          <div className="display" style={{ fontSize: '1.35rem', color: 'var(--text)', lineHeight: 1.1 }}>
            {formatShowDate(p.show_date, year)} · {p.venue_name ?? 'Venue TBD'}
          </div>
          <div className="text-sm text-muted">
            {[town, p.venue_address].filter(Boolean).join(' · ') || 'Town not given'}
            {r.agency_name ? ` · from ${r.agency_name}` : ''}
          </div>
        </div>
        <span className="badge badge-confirmed">Confirmed by your agent</span>
      </div>

      {(times.length > 0 || deal || commission || p.deal_notes) && (
        <dl style={{ margin: 0, display: 'grid', gap: '0.25rem', fontSize: '0.88rem', color: 'var(--text)' }}>
          {times.length > 0 && <Row label="Times" value={times.join(' · ')} />}
          {deal && <Row label="Deal" value={deal} />}
          {p.deal_notes && <Row label="Deal notes" value={p.deal_notes} />}
          {commission && <Row label="Commission" value={commission} />}
        </dl>
      )}

      {r.conflict && (
        <p role="note" className="text-sm" style={{ margin: 0, color: 'var(--orange)', fontWeight: 700 }}>
          You already have a show on this date. Move or cancel it on your calendar before adding this one, or decline.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm" style={{ margin: 0, color: 'var(--red)', fontWeight: 700 }}>
          {error}
        </p>
      )}

      {!declining ? (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" disabled={busy !== null || r.conflict} aria-busy={busy === 'accept'} onClick={() => void act('accept')}>
            {busy === 'accept' ? 'Adding…' : 'Add to calendar'}
          </button>
          <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => setDeclining(true)}>
            Decline
          </button>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '0.5rem' }}>
          <div className="field" style={{ marginBottom: 0 }}>
            <label className="field-label" htmlFor={noteId}>
              Note for your agent (optional)
            </label>
            <input id={noteId} className="input" maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. We're off that weekend" />
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-danger" disabled={busy !== null} aria-busy={busy === 'decline'} onClick={() => void act('decline')}>
              {busy === 'decline' ? 'Declining…' : 'Decline show'}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy !== null} onClick={() => setDeclining(false)}>
              Back
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '7rem minmax(0, 1fr)', gap: '0.5rem' }}>
      <dt className="text-muted" style={{ fontWeight: 700 }}>
        {label}
      </dt>
      <dd style={{ margin: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{value}</dd>
    </div>
  );
}
