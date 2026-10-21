// components/band/BookingAgentSettings.tsx
// "Booking agent" section of band Settings (build list item 3).
//
// The Band Admin sees invites a Booking Agent sent to their email (Accept /
// Decline), their band's linked agent with what that agent shares, and can
// end the link at any time; ending it takes effect immediately. A band can
// have one agent at a time. The database checks every step; members get
// nothing back from it.

import { useState, type CSSProperties } from 'react';
import Link from 'next/link';
import { formatShowDate } from '../../lib/booker/dates';
import { sharingSummary, type MyAgentLink } from '../../lib/booker/handoff';
import { answerAgentInvite, endAgentLink, listMyAgentLinks } from '../../lib/booker/handoffData';
import { BookerDataError } from '../../lib/booker/data';
import { useLoad } from '../../lib/booker/useLoad';

interface Props {
  /** The settings page's section label style, so this section matches its neighbours */
  labelStyle: CSSProperties;
}

async function loadLinks(): Promise<MyAgentLink[]> {
  try {
    return await listMyAgentLinks();
  } catch (err) {
    // Functions not installed yet: show the empty state rather than an error.
    if (err instanceof BookerDataError && err.code === 'PGRST202') return [];
    throw err;
  }
}

export default function BookingAgentSettings({ labelStyle }: Props) {
  const { data, loading, error, reload } = useLoad(loadLinks);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmEnd, setConfirmEnd] = useState<string | null>(null);
  const year = new Date().getFullYear();

  const run = async (key: string, fn: () => Promise<unknown>, done: string) => {
    setBusy(key);
    setActionError('');
    setNotice('');
    try {
      await fn();
      setNotice(done);
      setConfirmEnd(null);
      await reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setBusy(null);
    }
  };

  const invites = data?.filter(l => l.status === 'invited') ?? [];
  const active = data?.find(l => l.status === 'active') ?? null;
  const past = data?.filter(l => l.status === 'revoked').slice(0, 3) ?? [];
  const agentLabel = (l: MyAgentLink) => l.agency_name || l.agent_name || 'Your booking agent';

  return (
    <div id="booking-agent">
      <div style={labelStyle}>Booking Agent</div>
      <div className="card">
        <div className="card-header">
          <span className="card-title">BOOKING AGENT</span>
        </div>

        <div aria-live="polite">
          {notice && (
            <p role="status" className="text-sm" style={{ color: 'var(--green)', margin: '0 0 0.75rem' }}>
              {notice}
            </p>
          )}
        </div>
        {(error || actionError) && (
          <p role="alert" className="text-sm" style={{ color: 'var(--red)', fontWeight: 700, margin: '0 0 0.75rem' }}>
            {actionError || error}{' '}
            {error && !actionError && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => void reload()}>
                Try again
              </button>
            )}
          </p>
        )}

        {loading && !data ? (
          <div className="skeleton" style={{ height: 52, borderRadius: 'var(--radius-sm)' }} aria-busy="true" aria-label="Loading" />
        ) : (
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'minmax(0, 1fr)' }}>
            {invites.map(l => (
              <div key={l.link_id} className="agent-handoff-row" style={{ alignItems: 'flex-start' }}>
                <span>
                  <strong>{agentLabel(l)}</strong> wants to be your booking agent.
                  <span className="text-xs text-muted" style={{ display: 'block' }}>
                    {[l.agent_name, l.agent_email, l.agent_phone].filter(Boolean).join(' · ')}
                    {` · invited ${formatShowDate(l.invited_at.slice(0, 10), year)}`}
                  </span>
                  <span className="text-xs text-muted" style={{ display: 'block', marginTop: 4 }}>
                    If you accept, they can send confirmed shows for you to add to your calendar, and see your dates, show status and venues so they don&rsquo;t book over you. They never see your money or notes, and nothing goes on your calendar unless you add it.
                  </span>
                </span>
                <span style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={busy !== null || !!active}
                    title={active ? 'End your current agent link first' : undefined}
                    aria-busy={busy === `accept:${l.link_id}`}
                    onClick={() => void run(`accept:${l.link_id}`, () => answerAgentInvite(l.link_id, true), `${agentLabel(l)} is now your booking agent.`)}
                  >
                    {busy === `accept:${l.link_id}` ? 'Accepting…' : 'Accept'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    disabled={busy !== null}
                    onClick={() => void run(`decline:${l.link_id}`, () => answerAgentInvite(l.link_id, false), 'Invite declined.')}
                  >
                    {busy === `decline:${l.link_id}` ? 'Declining…' : 'Decline'}
                  </button>
                </span>
              </div>
            ))}
            {invites.length > 0 && active && (
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                A band can have one booking agent at a time. End your current link below to accept a new one.
              </p>
            )}

            {active ? (
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                <div>
                  <div style={{ fontWeight: 800, color: 'var(--text)' }}>{agentLabel(active)}</div>
                  <div className="text-sm text-muted">
                    {[active.agent_name, active.agent_email, active.agent_phone].filter(Boolean).join(' · ')}
                    {active.accepted_at ? ` · linked since ${formatShowDate(active.accepted_at.slice(0, 10), year)}` : ''}
                  </div>
                </div>
                <p className="text-sm" style={{ margin: 0, color: 'var(--text)', lineHeight: 1.6 }}>
                  Your agent sends confirmed shows to <Link href="/band#agent-requests">Requests from your agent</Link> on your home page; each one goes on your calendar only when you add it. On those shows they share {sharingSummary(active)}. They can see your dates, show status and venues, never your money or notes.
                </p>
                {confirmEnd !== active.link_id ? (
                  <div>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ whiteSpace: 'normal', textAlign: 'left' }} onClick={() => setConfirmEnd(active.link_id)}>
                      End link with {agentLabel(active)}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className="text-sm" style={{ color: 'var(--text)' }}>
                      End the link now? They lose access to your calendar right away. Shows already on your calendar stay.
                    </span>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      disabled={busy !== null}
                      aria-busy={busy === 'end'}
                      onClick={() => void run('end', () => endAgentLink(active.link_id), 'Link ended. Your agent no longer has access.')}
                    >
                      {busy === 'end' ? 'Ending…' : 'Yes, end it'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" disabled={busy !== null} onClick={() => setConfirmEnd(null)}>
                      Keep
                    </button>
                  </div>
                )}
              </div>
            ) : (
              invites.length === 0 && (
                <p className="text-sm text-muted" style={{ margin: 0, lineHeight: 1.6 }}>
                  No booking agent linked. When an agent who books your band invites you on Camel Ranch, the invite appears here for you to accept or decline. They need the email you sign in with.
                </p>
              )
            )}

            {past.length > 0 && (
              <p className="text-xs text-muted" style={{ margin: 0 }}>
                Past agents: {past.map(agentLabel).join(', ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
