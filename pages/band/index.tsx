import { useState, useEffect, useRef } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { getActId, getBandBookings } from '../../lib/bookingQueries';
import { BOOKING_STATUS_LABELS } from '../../lib/types';
import Link from 'next/link';

type Message = { role: 'user' | 'assistant'; content: string };

const QUICK_CHIPS: { label: string; href?: string; prompt?: string }[] = [
  { label: '→ View Targets',    href: '/tours' },
  { label: '→ Confirmed Shows', href: '/bookings?filter=confirmed' },
  { label: 'Draft outreach',    prompt: 'What venues should I prioritize for outreach this week based on my pipeline?' },
  { label: 'Plan a tour',       prompt: 'Help me think through routing for an upcoming tour. What should I consider?' },
];

export default function BandDashboard() {
  const [myAct, setMyAct]           = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [shows, setShows]           = useState<any[]>([]);
  const [tours, setTours]           = useState<any[]>([]);
  const [loading, setLoading]       = useState(true);

  const [messages, setMessages]       = useState<Message[]>([]);
  const [agentInput, setAgentInput]   = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError]   = useState('');
  const [noteSaved, setNoteSaved]     = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split('T')[0];
  const upcoming = shows
    .filter((b: any) => b.show_date && b.show_date >= today && ['confirmed', 'advancing', 'contract'].includes(b.status))
    .slice(0, 8);
  const confirmedCount = shows.filter((b: any) => ['confirmed', 'advancing', 'contract'].includes(b.status) && b.show_date && b.show_date >= today).length;
  const pipelineCount  = shows.filter((b: any) => ['pitch', 'negotiation', 'hold'].includes(b.status)).length;
  const activeToursCount = tours.filter((t: any) => t.status === 'active' || t.status === 'planning').length;

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
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
    setNoteSaved(false);

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
    if (messages.length === 0 || agentLoading) return;
    const { data: { session } } = await supabase.auth.getSession();
    const noteContent = messages.map(m => `${m.role === 'user' ? 'Q' : 'A'}: ${m.content}`).join('\n\n');
    await fetch('/api/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ content: noteContent, note_date: today, visibility: 'agent_only' }),
    });
    setNoteSaved(true);
  };

  const userInitials = userProfile?.display_name
    ? userProfile.display_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : userProfile?.email?.[0]?.toUpperCase() || '?';

  return (
    <AppShell requireRole="band_admin">

      {/* ── Header bar — 80px ──────────────────────────────────────────────── */}
      {myAct && (
        <div style={{
          height: 80, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 1.25rem', background: 'var(--bg-panel)',
          border: '1px solid var(--border)', marginBottom: '1.25rem',
        }}>
          {/* Left: act photo + name + genre */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            {myAct.profile_photo_url
              ? <img src={myAct.profile_photo_url} alt="" style={{ height: 56, width: 56, objectFit: 'cover', border: '2px solid var(--accent)', flexShrink: 0 }} />
              : <div style={{ height: 56, width: 56, background: 'rgba(224,120,32,0.12)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--accent)' }}>{myAct.act_name?.[0] || '?'}</span>
                </div>
            }
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '0.03em' }}>{myAct.act_name}</div>
              {myAct.genre && <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{myAct.genre}</div>}
            </div>
          </div>

          {/* Right: badge + avatar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid rgba(224,120,32,0.4)', padding: '0.25rem 0.7rem' }}>
              CAMEL RANCH BOOKING
            </div>
            <div style={{ width: 36, height: 36, background: 'rgba(224,120,32,0.15)', border: '1px solid rgba(224,120,32,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--accent)', flexShrink: 0 }}>
              {userInitials}
            </div>
          </div>
        </div>
      )}

      {/* ── No act state ─────────────────────────────────────────────────────── */}
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
          {/* ── Stat cards ──────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>

            <Link href="/tours" style={{ textDecoration: 'none', display: 'block', padding: '1.25rem 1.5rem', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderTop: '3px solid #f59e0b', position: 'relative', overflow: 'hidden' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#f59e0b')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top right, rgba(245,158,11,0.07), transparent 65%)', pointerEvents: 'none' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 80, color: '#f59e0b', lineHeight: 0.9 }}>{pipelineCount}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.5rem' }}>TARGETS</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: '0.2rem' }}>in pipeline</div>
            </Link>

            <Link href="/bookings?filter=confirmed" style={{ textDecoration: 'none', display: 'block', padding: '1.25rem 1.5rem', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderTop: '3px solid #34d399', position: 'relative', overflow: 'hidden' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#34d399')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top right, rgba(52,211,153,0.07), transparent 65%)', pointerEvents: 'none' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 80, color: '#34d399', lineHeight: 0.9 }}>{confirmedCount}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.5rem' }}>CONFIRMED</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: '0.2rem' }}>upcoming shows</div>
            </Link>

            <Link href="/tours" style={{ textDecoration: 'none', display: 'block', padding: '1.25rem 1.5rem', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderTop: '3px solid #60a5fa', position: 'relative', overflow: 'hidden' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = '#60a5fa')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
              <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at top right, rgba(96,165,250,0.07), transparent 65%)', pointerEvents: 'none' }} />
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 80, color: '#60a5fa', lineHeight: 0.9 }}>{activeToursCount}</div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.5rem' }}>TOURS</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: '0.2rem' }}>{tours.length} total</div>
            </Link>
          </div>

          {/* ── Mid section — equal height columns ─────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '1rem', alignItems: 'stretch', marginBottom: '1.25rem' }}>

            {/* Upcoming shows */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header" style={{ flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>UPCOMING SHOWS</span>
                <Link href="/bookings/new" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }}>+ ADD SHOW</Link>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {loading ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>
                ) : upcoming.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-muted)', fontSize: 14 }}>
                    <div>No upcoming confirmed shows.</div>
                    <Link href="/bookings/new" style={{ color: 'var(--accent)', fontWeight: 600, fontSize: 14 }}>Add a show →</Link>
                  </div>
                ) : (
                  <>
                    {upcoming.map((b: any) => (
                      <Link key={b.id} href={`/bookings/${b.id}`} style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', padding: '0.65rem 0.75rem', background: 'var(--bg-overlay)', border: '1px solid var(--border)', textDecoration: 'none', transition: 'border-color 0.15s' }}
                        onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                        onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                        <div style={{ minWidth: 44, textAlign: 'center', borderRight: '1px solid var(--border)', paddingRight: '0.75rem', flexShrink: 0 }}>
                          <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--accent)', lineHeight: 1 }}>
                            {new Date(b.show_date + 'T00:00:00').getDate()}
                          </div>
                          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                            {new Date(b.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.venue?.name || 'TBD'}</div>
                          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                            {b.venue?.city ? `${b.venue.city}, ${b.venue.state}` : ''}
                          </div>
                        </div>
                        <span className={`badge badge-${b.status}`} style={{ flexShrink: 0, fontSize: 11, fontWeight: 700 }}>
                          {BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}
                        </span>
                      </Link>
                    ))}
                    <div style={{ flex: 1, minHeight: 0 }} />
                  </>
                )}
              </div>
            </div>

            {/* AI Booking Agent — stretches full height */}
            <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-primary)' }}>AI BOOKING AGENT</span>
                {messages.length > 0 && (
                  <button onClick={saveConversation} className="btn btn-ghost btn-sm" style={{ color: noteSaved ? '#34d399' : 'var(--text-muted)' }} disabled={agentLoading}>
                    {noteSaved ? '✓ Saved' : '↓ Save Note'}
                  </button>
                )}
              </div>

              {/* Thread — flex:1 to fill all available height */}
              <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', minHeight: 0 }}>
                {messages.length === 0 && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
                    Ask about your pipeline, upcoming dates, or get help drafting outreach.
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{
                    alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '90%',
                    padding: '0.5rem 0.75rem',
                    background: m.role === 'user' ? 'rgba(224,120,32,0.14)' : 'var(--bg-overlay)',
                    border: `1px solid ${m.role === 'user' ? 'rgba(224,120,32,0.3)' : 'var(--border)'}`,
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: 'var(--text-primary)',
                    whiteSpace: 'pre-wrap',
                  }}>
                    {m.content}
                  </div>
                ))}
                {agentLoading && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>thinking…</div>
                )}
              </div>

              {/* Quick chips */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', padding: '0.6rem 1rem 0', flexShrink: 0 }}>
                {QUICK_CHIPS.map(chip =>
                  chip.href ? (
                    <Link key={chip.label} href={chip.href} style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, padding: '0.2rem 0.55rem', border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                      {chip.label}
                    </Link>
                  ) : (
                    <button key={chip.label} onClick={() => sendMessage(chip.prompt!)} disabled={agentLoading} style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, padding: '0.2rem 0.55rem', border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                      {chip.label}
                    </button>
                  )
                )}
              </div>

              {agentError && (
                <div style={{ margin: '0.4rem 1rem 0', fontSize: 13, color: '#f87171' }}>{agentError}</div>
              )}

              {/* Input — pinned to bottom */}
              <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <input
                  className="input"
                  style={{ flex: 1, fontSize: 14 }}
                  placeholder="Ask about your pipeline…"
                  value={agentInput}
                  onChange={e => setAgentInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(agentInput); } }}
                  disabled={agentLoading}
                />
                <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => sendMessage(agentInput)} disabled={agentLoading || !agentInput.trim()}>
                  {agentLoading ? '…' : '→'}
                </button>
              </div>
            </div>
          </div>

          {/* ── Bottom tiles ─────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
            {([
              { label: 'SOCIALS',    sub: 'Social post queue',     href: '/social',     accent: '#e879f9', icon: '✦' },
              { label: 'CALENDAR',   sub: 'View all shows',        href: '/calendar',   accent: '#60a5fa', icon: '◷' },
              { label: 'FINANCIALS', sub: 'Track payments & fees', href: '/financials', accent: '#34d399', icon: '$' },
              { label: 'NOTES',      sub: 'Daily notes & journal', href: '/notes',      accent: '#f59e0b', icon: '◎' },
            ] as { label: string; sub: string; href: string; accent: string; icon: string }[]).map(tile => (
              <Link key={tile.label} href={tile.href} style={{
                display: 'block', height: 90, padding: '1rem 1.25rem', textDecoration: 'none',
                background: 'var(--bg-panel)', border: '1px solid var(--border)',
                borderTop: `3px solid ${tile.accent}`, position: 'relative', overflow: 'hidden',
                transition: 'border-color 0.15s',
              }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = tile.accent; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
                <div style={{ position: 'absolute', top: '0.75rem', right: '0.9rem', fontFamily: 'var(--font-display)', fontSize: '1.4rem', color: tile.accent, opacity: 0.2 }}>{tile.icon}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: tile.accent }}>{tile.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: '0.3rem' }}>{tile.sub}</div>
              </Link>
            ))}
          </div>
        </>
      )}
    </AppShell>
  );
}
