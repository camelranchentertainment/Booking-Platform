import { useState, useEffect, useRef } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { getActId, getBandBookings } from '../../lib/bookingQueries';
import { BOOKING_STATUS_LABELS } from '../../lib/types';
import Link from 'next/link';

type Message = { role: 'user' | 'assistant'; content: string };

// Action types returned by /api/agent
type TourOutreachAction = {
  type: 'tour_outreach';
  tourId: string;
  tourName: string;
  venues: { tourVenueId: string; venueId: string; name: string; city?: string; state?: string; email?: string | null; contactName?: string | null }[];
  draft: { subject: string; body: string };
};
type CitySearchAction = {
  type: 'city_search';
  city: string;
  state: string;
  dateRange: string;
  venues: { id: string; name: string; city: string; state: string; email?: string | null; venue_type?: string | null; capacity?: number | null }[];
  activeTour: { id: string; name: string } | null;
};
type AgentAction = TourOutreachAction | CitySearchAction;

const QUICK_CHIPS: { label: string; href?: string; prompt?: string }[] = [
  { label: '→ View Targets',    href: '/tours' },
  { label: '→ Confirmed Shows', href: '/bookings?filter=confirmed' },
  { label: 'Draft outreach',    prompt: 'What venues should I prioritize for outreach this week based on my pipeline?' },
  { label: 'Plan a tour',       prompt: 'Help me think through routing for an upcoming tour. What should I consider?' },
];

export default function BandDashboard() {
  const [myAct, setMyAct]             = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [shows, setShows]             = useState<any[]>([]);
  const [tours, setTours]             = useState<any[]>([]);
  const [loading, setLoading]         = useState(true);

  // Agent state
  const [messages, setMessages]         = useState<Message[]>([]);
  const [agentInput, setAgentInput]     = useState('');
  const [agentLoading, setAgentLoading] = useState(false);
  const [agentError, setAgentError]     = useState('');
  const [noteSaved, setNoteSaved]       = useState(false);
  const [pendingAction, setPendingAction] = useState<AgentAction | null>(null);

  // Approval flow state
  const [draftSubject, setDraftSubject] = useState('');
  const [draftBody, setDraftBody]       = useState('');
  const [selectedVenueIds, setSelectedVenueIds] = useState<Set<string>>(new Set());
  const [sending, setSending]           = useState(false);
  const [sendResult, setSendResult]     = useState<{ sent: number; noEmail: number; errors: number } | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);

  const today = new Date().toISOString().split('T')[0];
  const upcoming = shows.filter((b: any) => b.show_date && b.show_date >= today && ['confirmed', 'advancing', 'contract'].includes(b.status)).slice(0, 8);
  const confirmedCount = shows.filter((b: any) => ['confirmed', 'advancing', 'contract'].includes(b.status) && b.show_date && b.show_date >= today).length;
  const pipelineCount  = shows.filter((b: any) => ['pitch', 'negotiation', 'hold'].includes(b.status)).length;
  const activeToursCount = tours.filter((t: any) => t.status === 'active' || t.status === 'planning').length;

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, pendingAction]);

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
    setPendingAction(null);
    setSendResult(null);

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

      if (json.action) {
        const action: AgentAction = json.action;
        setPendingAction(action);
        if (action.type === 'tour_outreach') {
          setDraftSubject(action.draft.subject);
          setDraftBody(action.draft.body);
          setSelectedVenueIds(new Set(action.venues.map(v => v.tourVenueId)));
        } else if (action.type === 'city_search') {
          setSelectedVenueIds(new Set(action.venues.map(v => v.id)));
        }
      }

      if (saveNote) setNoteSaved(true);
    } catch (err: any) {
      setAgentError(err.message);
      setMessages(next.slice(0, -1));
    } finally {
      setAgentLoading(false);
    }
  };

  const approveSend = async () => {
    if (!pendingAction || sending || !myAct) return;
    setSending(true);
    setSendResult(null);

    const { data: { session } } = await supabase.auth.getSession();

    let payload: any;
    if (pendingAction.type === 'tour_outreach') {
      const selected = pendingAction.venues.filter(v => selectedVenueIds.has(v.tourVenueId));
      payload = {
        venues:  selected,
        subject: draftSubject,
        body:    draftBody,
        actId:   myAct.id,
        tourId:  pendingAction.tourId,
      };
    } else {
      // city_search
      const selected = pendingAction.venues.filter(v => selectedVenueIds.has(v.id));
      payload = {
        venues:     selected.map(v => ({ venueId: v.id, name: v.name, city: v.city, state: v.state, email: v.email, contactName: null })),
        subject:    draftSubject || `Booking inquiry — ${myAct.act_name}`,
        body:       draftBody || `Hi {contact_name},\n\nWe're reaching out about booking ${myAct.act_name} at {venue_name}.\n\nBest,\nCamel Ranch Booking`,
        actId:      myAct.id,
        tourId:     pendingAction.activeTour?.id || null,
        addToTour:  !!pendingAction.activeTour,
      };
    }

    try {
      const res = await fetch('/api/agent-bulk-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Send failed');
      setSendResult({ sent: json.sent, noEmail: json.noEmail, errors: json.errors });
      const summary = `Sent ${json.sent} email${json.sent !== 1 ? 's' : ''}${json.noEmail ? `, ${json.noEmail} skipped (no email on file)` : ''}${json.errors ? `, ${json.errors} failed` : ''}.`;
      setMessages(prev => [...prev, { role: 'assistant', content: summary }]);
      setPendingAction(null);
    } catch (err: any) {
      setAgentError(err.message);
    } finally {
      setSending(false);
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

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      {myAct && (
        <div style={{ height: 80, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 1.25rem', background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem' }}>
            {myAct.profile_photo_url
              ? <img src={myAct.profile_photo_url} alt="" style={{ height: 56, width: 56, objectFit: 'cover', border: '2px solid var(--accent)', flexShrink: 0 }} />
              : <div style={{ height: 56, width: 56, background: 'rgba(224,120,32,0.12)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.6rem', color: 'var(--accent)' }}>{myAct.act_name?.[0] || '?'}</span>
                </div>
            }
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, fontWeight: 900, color: 'var(--text-primary)', lineHeight: 1, letterSpacing: '0.03em' }}>{myAct.act_name}</div>
              {myAct.genre && <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{myAct.genre}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.66rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid rgba(224,120,32,0.4)', padding: '0.25rem 0.7rem' }}>CAMEL RANCH BOOKING</div>
            <div style={{ width: 36, height: 36, background: 'rgba(224,120,32,0.15)', border: '1px solid rgba(224,120,32,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--accent)', flexShrink: 0 }}>{userInitials}</div>
          </div>
        </div>
      )}

      {!loading && !myAct && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--accent)', marginBottom: '1rem' }}>GET STARTED</div>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>Your account isn't connected to a band yet.</p>
          <Link href="/settings" className="btn btn-primary">Set Up Your Band →</Link>
        </div>
      )}

      {myAct && (
        <>
          {/* ── Stat cards ──────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
            {([
              { label: 'TARGETS',   value: pipelineCount,    sub: 'in pipeline',       href: '/tours',                    color: '#f59e0b' },
              { label: 'CONFIRMED', value: confirmedCount,   sub: 'upcoming shows',    href: '/bookings?filter=confirmed', color: '#34d399' },
              { label: 'TOURS',     value: activeToursCount, sub: `${tours.length} total`, href: '/tours',                color: '#60a5fa' },
            ] as any[]).map(card => (
              <Link key={card.label} href={card.href} style={{ textDecoration: 'none', display: 'block', padding: '1.25rem 1.5rem', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderTop: `3px solid ${card.color}`, position: 'relative', overflow: 'hidden', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = card.color)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at top right, ${card.color}11, transparent 65%)`, pointerEvents: 'none' }} />
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 80, color: card.color, lineHeight: 0.9 }}>{card.value}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{card.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: '0.2rem' }}>{card.sub}</div>
              </Link>
            ))}
          </div>

          {/* ── Mid section ─────────────────────────────────────────────────── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '1rem', alignItems: 'stretch', marginBottom: '1.25rem' }}>

            {/* Upcoming shows */}
            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header" style={{ flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>UPCOMING SHOWS</span>
                <Link href="/bookings/new" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }}>+ ADD SHOW</Link>
              </div>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {loading ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div>
                ) : upcoming.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.5rem', color: 'var(--text-muted)', fontSize: 14 }}>
                    <div>No upcoming confirmed shows.</div>
                    <Link href="/bookings/new" style={{ color: 'var(--accent)', fontWeight: 600 }}>Add a show →</Link>
                  </div>
                ) : upcoming.map((b: any) => (
                  <Link key={b.id} href={`/bookings/${b.id}`} style={{ display: 'flex', gap: '0.85rem', alignItems: 'center', padding: '0.65rem 0.75rem', background: 'var(--bg-overlay)', border: '1px solid var(--border)', textDecoration: 'none', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                    <div style={{ minWidth: 44, textAlign: 'center', borderRight: '1px solid var(--border)', paddingRight: '0.75rem', flexShrink: 0 }}>
                      <div style={{ fontFamily: 'var(--font-display)', fontSize: 28, color: 'var(--accent)', lineHeight: 1 }}>{new Date(b.show_date + 'T00:00:00').getDate()}</div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{new Date(b.show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 16, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.venue?.name || 'TBD'}</div>
                      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>{b.venue?.city ? `${b.venue.city}, ${b.venue.state}` : ''}</div>
                    </div>
                    <span className={`badge badge-${b.status}`} style={{ flexShrink: 0, fontSize: 11, fontWeight: 700 }}>{BOOKING_STATUS_LABELS[b.status as keyof typeof BOOKING_STATUS_LABELS]}</span>
                  </Link>
                ))}
              </div>
            </div>

            {/* AI Booking Agent */}
            <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI BOOKING AGENT</span>
                {messages.length > 0 && (
                  <button onClick={saveConversation} className="btn btn-ghost btn-sm" style={{ color: noteSaved ? '#34d399' : 'var(--text-muted)' }} disabled={agentLoading}>
                    {noteSaved ? '✓ Saved' : '↓ Save Note'}
                  </button>
                )}
              </div>

              {/* Thread */}
              <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.6rem', minHeight: 0 }}>
                {messages.length === 0 && !pendingAction && (
                  <div style={{ color: 'var(--text-muted)', fontSize: 14, lineHeight: 1.6 }}>
                    Ask about your pipeline, get venue suggestions, or say "send outreach to all targets on [tour name]" to blast a tour.
                  </div>
                )}
                {messages.map((m, i) => (
                  <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '90%', padding: '0.5rem 0.75rem', background: m.role === 'user' ? 'rgba(224,120,32,0.14)' : 'var(--bg-overlay)', border: `1px solid ${m.role === 'user' ? 'rgba(224,120,32,0.3)' : 'var(--border)'}`, fontSize: 14, lineHeight: 1.55, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>
                    {m.content}
                  </div>
                ))}
                {agentLoading && <div style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>thinking…</div>}

                {/* ── Approval panel ─────────────────────────────────────── */}
                {pendingAction && (
                  <div style={{ background: 'var(--bg-overlay)', border: '1px solid var(--accent)', padding: '0.85rem', fontSize: 13, display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                      {pendingAction.type === 'tour_outreach'
                        ? `${pendingAction.venues.length} VENUES — ${pendingAction.tourName.toUpperCase()}`
                        : `${pendingAction.venues.length} VENUES FOUND — ${pendingAction.city.toUpperCase()}, ${pendingAction.state}`}
                    </div>

                    {/* Venue checklist */}
                    <div style={{ maxHeight: 140, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      {(pendingAction.type === 'tour_outreach' ? pendingAction.venues : pendingAction.venues).map((v: any) => {
                        const id = pendingAction.type === 'tour_outreach' ? v.tourVenueId : v.id;
                        const checked = selectedVenueIds.has(id);
                        const hasEmail = pendingAction.type === 'tour_outreach' ? !!v.email : !!v.email;
                        return (
                          <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: hasEmail ? 'pointer' : 'default', opacity: hasEmail ? 1 : 0.45 }}>
                            <input type="checkbox" checked={checked && hasEmail} disabled={!hasEmail} onChange={() => {
                              setSelectedVenueIds(prev => {
                                const next = new Set(prev);
                                next.has(id) ? next.delete(id) : next.add(id);
                                return next;
                              });
                            }} />
                            <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>{v.name}</span>
                            {v.city && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{v.city}, {v.state || v.venue?.state}</span>}
                            {!hasEmail && <span style={{ color: '#f87171', fontSize: 11 }}>no email</span>}
                          </label>
                        );
                      })}
                    </div>

                    {/* Email draft — only show for tour_outreach or allow editing for city_search */}
                    {pendingAction.type === 'tour_outreach' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                        <input className="input" style={{ fontSize: 13 }} placeholder="Subject" value={draftSubject} onChange={e => setDraftSubject(e.target.value)} />
                        <textarea className="input" style={{ fontSize: 13, minHeight: 90, resize: 'vertical' }} value={draftBody} onChange={e => setDraftBody(e.target.value)} />
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{'{venue_name}'} and {'{contact_name}'} will be personalized per recipient.</div>
                      </div>
                    )}

                    {sendResult && (
                      <div style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>
                        ✓ Sent {sendResult.sent}{sendResult.noEmail ? `, ${sendResult.noEmail} skipped` : ''}{sendResult.errors ? `, ${sendResult.errors} errors` : ''}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button className="btn btn-primary" style={{ flex: 1, fontSize: 13 }} onClick={approveSend} disabled={sending || selectedVenueIds.size === 0}>
                        {sending ? 'Sending…' : `Send to ${selectedVenueIds.size} venue${selectedVenueIds.size !== 1 ? 's' : ''}`}
                      </button>
                      <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => { setPendingAction(null); setSendResult(null); }} disabled={sending}>Cancel</button>
                    </div>
                  </div>
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

              {agentError && <div style={{ margin: '0.4rem 1rem 0', fontSize: 13, color: '#f87171' }}>{agentError}</div>}

              {/* Input */}
              <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
                <input className="input" style={{ flex: 1, fontSize: 14 }} placeholder="Ask about your pipeline or say &quot;send outreach to [tour]&quot;…" value={agentInput} onChange={e => setAgentInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(agentInput); } }} disabled={agentLoading} />
                <button className="btn btn-primary" style={{ flexShrink: 0 }} onClick={() => sendMessage(agentInput)} disabled={agentLoading || !agentInput.trim()}>{agentLoading ? '…' : '→'}</button>
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
            ] as any[]).map(tile => (
              <Link key={tile.label} href={tile.href} style={{ display: 'block', height: 90, padding: '1rem 1.25rem', textDecoration: 'none', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderTop: `3px solid ${tile.accent}`, position: 'relative', overflow: 'hidden', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = tile.accent)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
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
