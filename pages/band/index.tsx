import { useState, useEffect, useRef } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { getActId, getBandBookings } from '../../lib/bookingQueries';
import { BOOKING_STATUS_LABELS } from '../../lib/types';
import Link from 'next/link';
import { useRouter } from 'next/router';

type Message = { role: 'user' | 'assistant'; content: string };

const QUICK_CHIPS = [
  { label: 'View Targets',     href: '/tours' },
  { label: 'Confirmed Shows',  href: '/bookings?filter=confirmed' },
  { label: 'Draft outreach',   prompt: 'What venues should I prioritize for outreach this week?' },
  { label: 'Plan a tour',      prompt: 'Help me think through routing for an upcoming tour.' },
];

export default function BandDashboard() {
  const router = useRouter();

  // ── Data ────────────────────────────────────────────────────────────────────
  const [myAct, setMyAct]         = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [shows, setShows]         = useState<any[]>([]);
  const [tours, setTours]         = useState<any[]>([]);
  const [loading, setLoading]     = useState(true);

  // ── Agent panel ──────────────────────────────────────────────────────────────
  const [messages, setMessages]   = useState<Message[]>([]);
  const [agentInput, setAgentInput] = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError]   = useState('');
  const [noteSaved, setNoteSaved]     = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  // ── Derived stats ────────────────────────────────────────────────────────────
  const today = new Date().toISOString().split('T')[0];
  const upcoming = shows
    .filter((b: any) => b.show_date && b.show_date >= today && ['confirmed', 'advancing', 'contract'].includes(b.status))
    .slice(0, 8);
  const confirmedCount = shows.filter((b: any) => ['confirmed', 'advancing', 'contract'].includes(b.status) && b.show_date && b.show_date >= today).length;
  const pipelineCount  = shows.filter((b: any) => ['pitch', 'negotiation', 'hold'].includes(b.status)).length;
  const activeToursCount = tours.filter((t: any) => t.status === 'active' || t.status === 'planning').length;

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [messages]);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const actId = await getActId(supabase, user.id);
    if (!actId) { setLoading(false); return; }

    const [actRes, profileRes, bookingsData, toursRes] = await Promise.all([
      supabase.from('acts').select('*').eq('id', actId).eq('is_active', true).single(),
      supabase.from('user_profiles').select('display_name, email, role').eq('id', user.id).single(),
      getBandBookings(supabase, actId),
      supabase.from('tours').select('id, name, status, start_date, end_date').eq('act_id', actId).neq('status', 'cancelled').order('start_date', { ascending: true }).limit(6),
    ]);

    setMyAct(actRes.data || null);
    setUserProfile(profileRes.data || null);
    setShows(bookingsData);
    setTours(toursRes.data || []);
    setLoading(false);
  };

  const sendMessage = async (msg: string, saveNote = false) => {
    if (!msg.trim() || agentLoading) return;
    const userMsg: Message = { role: 'user', content: msg.trim() };
    const next = [...messages, userMsg];
    setMessages(next);
    setAgentInput('');
    setAgentLoading(true);
    setAgentError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const history = next.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ message: msg.trim(), history, saveNote }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Agent error');
      setMessages([...next, { role: 'assistant', content: json.reply }]);
      if (saveNote) setNoteSaved(true);
    } catch (err: any) {
      setAgentError(err.message);
      setMessages(next.slice(0, -1));
    } finally {
      setAgentLoading(false);
    }
  };

  const saveConversation = async () => {
    if (messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last.role === 'assistant') {
      await sendMessage('Summarize our conversation above as brief notes.', true);
    } else {
      setNoteSaved(false);
      const { data: { session } } = await supabase.auth.getSession();
      const noteContent = messages.map(m => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`).join('\n');
      await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ content: noteContent, note_date: today, visibility: 'agent_only' }),
      });
      setNoteSaved(true);
    }
  };

  const userInitials = userProfile?.display_name
    ? userProfile.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : userProfile?.email?.[0]?.toUpperCase() || '?';

  return (
    <AppShell requireRole="band_admin">

      {/* ── Header bar ──────────────────────────────────────────────────────── */}
      {myAct && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '1rem',
          padding: '0.85rem 1.25rem', background: 'var(--bg-panel)',
          border: '1px solid var(--border)', borderRadius: 'var(--radius)',
          marginBottom: '1.25rem',
        }}>
          {myAct.profile_photo_url && (
            <img src={myAct.profile_photo_url} alt="" style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--accent)', flexShrink: 0 }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.25rem', color: 'var(--text-primary)', letterSpacing: '0.04em', lineHeight: 1 }}>{myAct.act_name}</div>
            {myAct.genre && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.76rem', color: 'var(--text-muted)', marginTop: '0.15rem', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{myAct.genre}</div>}
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid rgba(224,120,32,0.35)', borderRadius: 'var(--radius-sm)', padding: '0.25rem 0.6rem', flexShrink: 0 }}>
            CAMEL RANCH BOOKING
          </div>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'rgba(224,120,32,0.15)', border: '1px solid rgba(224,120,32,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '0.9rem', color: 'var(--accent)', flexShrink: 0 }}>
            {userInitials}
          </div>
        </div>
      )}

      {/* ── No act state ────────────────────────────────────────────────────── */}
      {!loading && !myAct && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--accent)', marginBottom: '1rem' }}>GET STARTED</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
            Your account isn't connected to a band yet. Set up your profile to get started.
          </p>
          <Link href="/settings" className="btn btn-primary">Set Up Your Band →</Link>
        </div>
      )}

      {myAct && (
        <>
          {/* ── Stat cards ────────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
            <Link href="/tours" className="stat-block" style={{ textDecoration: 'none', borderTop: '3px solid #f59e0b', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top right, rgba(245,158,11,0.08), transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: '#f59e0b', lineHeight: 1 }}>{pipelineCount}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.3rem' }}>TARGETS</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>in pipeline</div>
            </Link>

            <Link href="/bookings?filter=confirmed" className="stat-block" style={{ textDecoration: 'none', borderTop: '3px solid #34d399', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top right, rgba(52,211,153,0.08), transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: '#34d399', lineHeight: 1 }}>{confirmedCount}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.3rem' }}>CONFIRMED</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>upcoming shows</div>
            </Link>

            <Link href="/tours" className="stat-block" style={{ textDecoration: 'none', borderTop: '3px solid #60a5fa', position: 'relative', overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top right, rgba(96,165,250,0.08), transparent 70%)', pointerEvents: 'none' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: '#60a5fa', lineHeight: 1 }}>{activeToursCount}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.3rem' }}>TOURS</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>{tours.length} total</div>
            </Link>
          </div>

          {/* ── Middle row ─────────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.25rem', alignItems: 'start' }}>

            {/* Upcoming shows */}
            <div className="card">
              <div className="card-header">
                <span className="card-title">UPCOMING SHOWS</span>
                <Link href="/bookings/new" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }}>+ Add Show</Link>
              </div>
              {loading ? (
                <div style={{ color: 'var(--text-muted)', fontSize: '0.84rem', padding: '0.5rem 0' }}>Loading…</div>
              ) : upcoming.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
                  No upcoming confirmed shows.{' '}
                  <Link href="/bookings/new" style={{ color: 'var(--accent)', fontWeight: 600 }}>Add one →</Link>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {upcoming.map((b: any) => (
                    <Link key={b.id} href={`/bookings/${b.id}`} style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', padding: '0.6rem 0.75rem', background: 'var(--bg-overlay)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', textDecoration: 'none', transition: 'border-color 0.15s' }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                      <div style={{ minWidth: 40, textAlign: 'center', flexShrink: 0 }}>
                        <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: 'var(--accent)', lineHeight: 1 }}>
                          {new Date(b.show_date + 'T00:00:00').getDate()}
                        </div>
                        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                          {new Date(b.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                        </div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.venue?.name || 'TBD'}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.74rem', fontFamily: 'var(--font-body)' }}>
                          {b.venue?.city ? `${b.venue.city}, ${b.venue.state}` : ''}
                        </div>
                      </div>
                      <span className={`badge badge-${b.status}`} style={{ flexShrink: 0 }}>
                        {BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* AI Booking Agent */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 460 }}>
              <div className="card-header" style={{ flexShrink: 0 }}>
                <span className="card-title">AI BOOKING AGENT</span>
                {messages.length > 0 && (
                  <button
                    onClick={saveConversation}
                    className="btn btn-ghost btn-sm"
                    style={{ color: noteSaved ? '#34d399' : 'var(--text-muted)' }}
                    disabled={agentLoading}
                  >
                    {noteSaved ? '✓ Saved' : '↓ Save Note'}
                  </button>
                )}
              </div>

              {/* Thread */}
              <div
                ref={threadRef}
                style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.65rem', marginBottom: '0.75rem', minHeight: 200, maxHeight: 280 }}
              >
                {messages.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.82rem', lineHeight: 1.6, padding: '0.5rem 0' }}>
                    Ask anything about your pipeline, upcoming dates, or get help drafting outreach.
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '88%',
                    padding: '0.5rem 0.75rem',
                    borderRadius: 'var(--radius-sm)',
                    background: m.role === 'user' ? 'rgba(224,120,32,0.15)' : 'var(--bg-overlay)',
                    border: `1px solid ${m.role === 'user' ? 'rgba(224,120,32,0.3)' : 'var(--border)'}`,
                    color: 'var(--text-primary)',
                    fontSize: '0.84rem',
                    fontFamily: 'var(--font-body)',
                    lineHeight: 1.5,
                    whiteSpace: 'pre-wrap',
                  }}>
                    {m.content}
                  </div>
                ))}
                {agentLoading && (
                  <div style={{ alignSelf: 'flex-start', color: 'var(--text-muted)', fontSize: '0.8rem', fontFamily: 'var(--font-mono)', padding: '0.25rem 0' }}>
                    thinking…
                  </div>
                )}
              </div>

              {/* Quick chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.65rem', flexShrink: 0 }}>
                {QUICK_CHIPS.map(chip => (
                  chip.href ? (
                    <Link key={chip.label} href={chip.href} style={{
                      fontFamily: 'var(--font-body)', fontSize: '0.74rem', fontWeight: 500,
                      padding: '0.22rem 0.6rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-muted)', textDecoration: 'none', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                    >→ {chip.label}</Link>
                  ) : (
                    <button key={chip.label} onClick={() => sendMessage(chip.prompt!)} disabled={agentLoading} style={{
                      fontFamily: 'var(--font-body)', fontSize: '0.74rem', fontWeight: 500,
                      padding: '0.22rem 0.6rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-muted)', background: 'transparent', cursor: 'pointer', transition: 'all 0.15s',
                    }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
                    >{chip.label}</button>
                  )
                ))}
              </div>

              {agentError && (
                <div style={{ fontSize: '0.76rem', color: '#f87171', marginBottom: '0.5rem', fontFamily: 'var(--font-body)' }}>{agentError}</div>
              )}

              {/* Input */}
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <input
                  className="input"
                  style={{ flex: 1, fontSize: '0.84rem' }}
                  placeholder="Ask about your pipeline…"
                  value={agentInput}
                  onChange={e => setAgentInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(agentInput); } }}
                  disabled={agentLoading}
                />
                <button
                  className="btn btn-primary"
                  style={{ flexShrink: 0 }}
                  onClick={() => sendMessage(agentInput)}
                  disabled={agentLoading || !agentInput.trim()}
                >
                  {agentLoading ? '…' : '→'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Bottom tiles ──────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {([
              { label: 'SOCIALS',    sub: 'Social post queue',       href: '/social',   accent: '#e879f9', icon: '◈' },
              { label: 'CALENDAR',   sub: 'View all shows',          href: '/calendar', accent: '#60a5fa', icon: '◷' },
              { label: 'FINANCIALS', sub: 'Track payments & fees',   href: '/bookings', accent: '#34d399', icon: '$' },
              { label: 'NOTES',      sub: 'Daily notes & journal',   href: '/notes',    accent: '#f59e0b', icon: '◎' },
            ] as { label: string; sub: string; href: string; accent: string; icon: string }[]).map(tile => (
              <Link key={tile.label} href={tile.href} style={{
                display: 'block', padding: '1.1rem 1.25rem', textDecoration: 'none',
                background: 'var(--bg-panel)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius)', borderTop: `3px solid ${tile.accent}`,
                transition: 'border-color 0.15s, background 0.15s',
                position: 'relative', overflow: 'hidden',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tile.accent; (e.currentTarget as HTMLElement).style.background = `color-mix(in srgb, ${tile.accent} 6%, var(--bg-panel))`; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-panel)'; }}
              >
                <div style={{ position: 'absolute', top: '0.75rem', right: '0.9rem', fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: tile.accent, opacity: 0.25 }}>{tile.icon}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: tile.accent, marginBottom: '0.35rem' }}>{tile.label}</div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)' }}>{tile.sub}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
