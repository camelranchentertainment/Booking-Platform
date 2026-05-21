import { useState, useEffect, useRef } from 'react';
import AppShell from '../../components/layout/AppShell';
import { supabase } from '../../lib/supabase';
import { getActId } from '../../lib/bookingQueries';
import Link from 'next/link';

// ── Types ──────────────────────────────────────────────────────────────────────
type Message = { role: 'user' | 'assistant'; content: string };

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
  { label: 'Show my targets',       href: '/tours' },
  { label: 'Show confirmed shows',  href: '/bookings?filter=confirmed' },
  { label: 'Draft outreach email',  prompt: 'Help me draft a cold pitch outreach email for my next tour.' },
  { label: 'Help me plan a tour',   prompt: 'Help me plan a tour. What should I think about for routing, timing, and targeting venues?' },
];

function timeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return 'morning';
  if (h < 17) return 'afternoon';
  return 'evening';
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export default function BandDashboard() {
  // Data
  const [myAct, setMyAct]             = useState<any>(null);
  const [userProfile, setUserProfile] = useState<any>(null);
  const [targetsCount, setTargetsCount]   = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [toursCount, setToursCount]     = useState(0);
  const [loading, setLoading]           = useState(true);

  // Agent
  const [messages, setMessages]           = useState<Message[]>([]);
  const [agentInput, setAgentInput]       = useState('');
  const [agentLoading, setAgentLoading]   = useState(false);
  const [agentError, setAgentError]       = useState('');
  const [noteSaved, setNoteSaved]         = useState(false);
  const [pendingAction, setPendingAction] = useState<AgentAction | null>(null);
  const [greetingSent, setGreetingSent]   = useState(false);

  // Approval
  const [draftSubject, setDraftSubject]           = useState('');
  const [draftBody, setDraftBody]                 = useState('');
  const [selectedVenueIds, setSelectedVenueIds]   = useState<Set<string>>(new Set());
  const [sending, setSending]                     = useState(false);
  const [sendResult, setSendResult]               = useState<{ sent: number; noEmail: number; errors: number } | null>(null);

  const threadRef = useRef<HTMLDivElement>(null);
  const today = new Date().toISOString().split('T')[0];

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (threadRef.current) threadRef.current.scrollTop = threadRef.current.scrollHeight;
  }, [messages, pendingAction]);

  // Auto-greet once act data is loaded
  useEffect(() => {
    if (myAct && userProfile && !greetingSent && !loading) {
      setGreetingSent(true);
      const firstName = (userProfile.display_name || '').split(' ')[0] || 'there';
      const tagline = [myAct.genre, myAct.home_city && myAct.home_state ? `${myAct.home_city}, ${myAct.home_state}` : null].filter(Boolean).join(' · ');
      const greeting = `Good ${timeOfDay()}, ${firstName}. ${myAct.act_name}${tagline ? ` — ${tagline}` : ''} — has **${targetsCount}** venue${targetsCount !== 1 ? 's' : ''} targeted across **${toursCount}** active tour${toursCount !== 1 ? 's' : ''} and **${confirmedCount}** confirmed show${confirmedCount !== 1 ? 's' : ''} coming up. What do you want to work on today?`;
      setMessages([{ role: 'assistant', content: greeting }]);
    }
  }, [myAct, userProfile, loading, greetingSent, targetsCount, confirmedCount, toursCount]);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const actId = await getActId(supabase, user.id);
    if (!actId) { setLoading(false); return; }

    const [actRes, profileRes] = await Promise.all([
      supabase.from('acts').select('*').eq('id', actId).eq('is_active', true).single(),
      supabase.from('user_profiles').select('display_name, email, role').eq('id', user.id).single(),
    ]);

    setMyAct(actRes.data || null);
    setUserProfile(profileRes.data || null);

    if (actRes.data) {
      // Accurate counts per spec
      const tourIdsRes = await supabase.from('tours').select('id').eq('act_id', actId).neq('status', 'cancelled');
      const tourIds = (tourIdsRes.data || []).map((t: any) => t.id);

      const [tvTargetRes, confirmedRes, toursRes] = await Promise.all([
        tourIds.length
          ? supabase.from('tour_venues').select('id', { count: 'exact', head: true }).in('tour_id', tourIds).eq('status', 'target')
          : Promise.resolve({ count: 0 }),
        supabase.from('bookings').select('id', { count: 'exact', head: true }).eq('act_id', actId).eq('status', 'confirmed').gt('show_date', today),
        supabase.from('tours').select('id', { count: 'exact', head: true }).eq('act_id', actId).in('status', ['planning', 'active']),
      ]);

      setTargetsCount((tvTargetRes as any).count ?? 0);
      setConfirmedCount((confirmedRes as any).count ?? 0);
      setToursCount((toursRes as any).count ?? 0);
    }

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
      payload = {
        venues:  pendingAction.venues.filter(v => selectedVenueIds.has(v.tourVenueId)),
        subject: draftSubject,
        body:    draftBody,
        actId:   myAct.id,
        tourId:  pendingAction.tourId,
      };
    } else {
      payload = {
        venues:    pendingAction.venues.filter(v => selectedVenueIds.has(v.id)).map(v => ({ venueId: v.id, name: v.name, city: v.city, state: v.state, email: v.email, contactName: null })),
        subject:   draftSubject || `Booking inquiry — ${myAct.act_name}`,
        body:      draftBody || `Hi {contact_name},\n\nWe're reaching out about booking ${myAct.act_name} at {venue_name}.\n\nBest,\nCamel Ranch Booking`,
        actId:     myAct.id,
        tourId:    pendingAction.activeTour?.id || null,
        addToTour: !!pendingAction.activeTour,
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
      setMessages(prev => [...prev, { role: 'assistant', content: `Sent ${json.sent} email${json.sent !== 1 ? 's' : ''}${json.noEmail ? `, ${json.noEmail} skipped (no email on file)` : ''}${json.errors ? `, ${json.errors} failed` : ''}. Venues have been marked as pitched.` }]);
      setPendingAction(null);
      // Refresh targets count
      load();
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

  const tagline = myAct ? [
    myAct.genre,
    myAct.home_city && myAct.home_state ? `${myAct.home_city}, ${myAct.home_state}` : myAct.home_city || null,
  ].filter(Boolean).join(' · ') : '';

  return (
    <AppShell requireRole="band_admin">
      <style>{`
        .dash-act-header  { display:flex; align-items:center; justify-content:space-between; min-height:70px; padding:0.75rem 1rem; background:var(--bg-panel); border:1px solid var(--border); margin-bottom:1.25rem; }
        .dash-act-name    { font-family:var(--font-display); font-size:20px; font-weight:900; color:var(--text-primary); line-height:1; letter-spacing:0.03em; }
        .dash-crb-badge   { display:none; }
        .dash-stats-grid  { display:grid; grid-template-columns:1fr; gap:0.75rem; margin-bottom:1.25rem; }
        .dash-tiles-grid  { display:grid; grid-template-columns:repeat(2,1fr); gap:0.75rem; }
        .dash-appr-grid   { display:grid; grid-template-columns:1fr; gap:0.25rem; max-height:160px; overflow-y:auto; }
        .dash-draft-grid  { display:grid; grid-template-columns:1fr; gap:0.5rem; align-items:start; }
        .dash-msg-ai      { max-width:90%; }
        .dash-msg-user    { max-width:88%; }
        @media(min-width:640px){
          .dash-act-header  { height:80px; padding:0 1.25rem; }
          .dash-act-name    { font-size:28px; }
          .dash-crb-badge   { display:flex; }
          .dash-stats-grid  { grid-template-columns:repeat(3,1fr); }
          .dash-tiles-grid  { grid-template-columns:repeat(4,1fr); }
          .dash-appr-grid   { grid-template-columns:repeat(2,1fr); gap:0.25rem 1.5rem; }
          .dash-draft-grid  { grid-template-columns:1fr 2fr; }
          .dash-msg-ai      { max-width:75%; }
          .dash-msg-user    { max-width:60%; }
        }
      `}</style>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      {myAct && (
        <div className="dash-act-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.9rem', minWidth: 0 }}>
            {myAct.profile_photo_url
              ? <img src={myAct.profile_photo_url} alt="" style={{ height: 52, width: 52, objectFit: 'cover', border: '2px solid var(--accent)', flexShrink: 0 }} />
              : <div style={{ height: 52, width: 52, background: 'rgba(224,120,32,0.12)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--accent)' }}>{myAct.act_name?.[0] || '?'}</span>
                </div>
            }
            <div style={{ minWidth: 0 }}>
              <div className="dash-act-name">{myAct.act_name}</div>
              {tagline && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.1em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tagline}</div>}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flexShrink: 0 }}>
            <div className="dash-crb-badge" style={{ fontFamily: 'var(--font-mono)', fontSize: '0.62rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--accent)', border: '1px solid rgba(224,120,32,0.4)', padding: '0.2rem 0.6rem', alignItems: 'center' }}>CAMEL RANCH BOOKING</div>
            <div style={{ width: 34, height: 34, background: 'rgba(224,120,32,0.15)', border: '1px solid rgba(224,120,32,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--font-display)', fontSize: '1rem', color: 'var(--accent)', flexShrink: 0 }}>{userInitials}</div>
          </div>
        </div>
      )}

      {/* ── No act state ─────────────────────────────────────────────────────── */}
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
          <div className="dash-stats-grid">
            {([
              { label: 'TARGETS',   value: targetsCount,   sub: 'venues in target list',   href: '/tours',                    color: '#f59e0b' },
              { label: 'CONFIRMED', value: confirmedCount, sub: 'upcoming confirmed shows', href: '/bookings?filter=confirmed', color: '#34d399' },
              { label: 'TOURS',     value: toursCount,     sub: 'planning or active',       href: '/tours',                    color: '#60a5fa' },
            ] as any[]).map(card => (
              <Link key={card.label} href={card.href} style={{ textDecoration: 'none', display: 'block', padding: '1.25rem 1.5rem', background: 'var(--bg-panel)', border: '1px solid var(--border)', borderTop: `3px solid ${card.color}`, position: 'relative', overflow: 'hidden', transition: 'border-color 0.15s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = card.color)}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div style={{ position: 'absolute', inset: 0, background: `radial-gradient(ellipse at top right, ${card.color}11, transparent 65%)`, pointerEvents: 'none' }} />
                {loading
                  ? <div style={{ height: 72, background: 'rgba(255,255,255,0.05)', marginBottom: 8 }} />
                  : <div style={{ fontFamily: 'var(--font-display)', fontSize: 80, color: card.color, lineHeight: 0.9 }}>{card.value}</div>
                }
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginTop: '0.5rem' }}>{card.label}</div>
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: '0.2rem' }}>{card.sub}</div>
              </Link>
            ))}
          </div>

          {/* ── AI Booking Agent — full width ──────────────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-panel)', border: '1px solid var(--border)', marginBottom: '1.25rem', minHeight: 480 }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>AI BOOKING AGENT</span>
              {messages.length > 1 && (
                <button onClick={saveConversation} className="btn btn-ghost btn-sm" style={{ color: noteSaved ? '#34d399' : 'var(--text-muted)' }} disabled={agentLoading}>
                  {noteSaved ? '✓ Saved' : '↓ Save Note'}
                </button>
              )}
            </div>

            {/* Thread */}
            <div ref={threadRef} style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', minHeight: 0 }}>
              {messages.map((m, i) => (
                <div key={i} className={m.role === 'user' ? 'dash-msg-user' : 'dash-msg-ai'} style={{
                  alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                  padding: '0.6rem 0.85rem',
                  background: m.role === 'user' ? 'rgba(224,120,32,0.14)' : 'var(--bg-overlay)',
                  border: `1px solid ${m.role === 'user' ? 'rgba(224,120,32,0.3)' : 'var(--border)'}`,
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'var(--text-primary)',
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content.split(/\*\*(.*?)\*\*/g).map((chunk, ci) =>
                    ci % 2 === 1
                      ? <strong key={ci} style={{ color: 'var(--accent)', fontWeight: 700 }}>{chunk}</strong>
                      : chunk
                  )}
                </div>
              ))}
              {agentLoading && <div style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-mono)', alignSelf: 'flex-start' }}>thinking…</div>}

              {/* Approval panel */}
              {pendingAction && (
                <div style={{ background: 'var(--bg-overlay)', border: '1px solid var(--accent)', padding: '0.85rem 1rem', fontSize: 13, display: 'flex', flexDirection: 'column', gap: '0.65rem', alignSelf: 'stretch' }}>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)' }}>
                    {pendingAction.type === 'tour_outreach'
                      ? `${pendingAction.venues.length} VENUES — ${pendingAction.tourName.toUpperCase()}`
                      : `${pendingAction.venues.length} VENUES — ${pendingAction.city.toUpperCase()}, ${pendingAction.state}`}
                  </div>

                  {/* Venue checklist */}
                  <div className="dash-appr-grid">
                    {(pendingAction.type === 'tour_outreach' ? pendingAction.venues : pendingAction.venues).map((v: any) => {
                      const id = pendingAction.type === 'tour_outreach' ? v.tourVenueId : v.id;
                      const hasEmail = !!v.email;
                      return (
                        <label key={id} style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', cursor: hasEmail ? 'pointer' : 'default', opacity: hasEmail ? 1 : 0.4 }}>
                          <input type="checkbox" checked={selectedVenueIds.has(id) && hasEmail} disabled={!hasEmail}
                            onChange={() => setSelectedVenueIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })} />
                          <span style={{ color: 'var(--text-primary)', fontSize: 13 }}>{v.name}</span>
                          {v.city && <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>{v.city}</span>}
                          {!hasEmail && <span style={{ color: '#f87171', fontSize: 11, marginLeft: 'auto' }}>no email</span>}
                        </label>
                      );
                    })}
                  </div>

                  {/* Email draft editor */}
                  {pendingAction.type === 'tour_outreach' && (
                    <div className="dash-draft-grid">
                      <input className="input" style={{ fontSize: 13 }} placeholder="Subject" value={draftSubject} onChange={e => setDraftSubject(e.target.value)} />
                      <textarea className="input" style={{ fontSize: 13, minHeight: 80, resize: 'vertical' }} value={draftBody} onChange={e => setDraftBody(e.target.value)} />
                    </div>
                  )}
                  {pendingAction.type === 'tour_outreach' && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{'{venue_name}'} and {'{contact_name}'} are personalized per recipient.</div>
                  )}

                  {sendResult && (
                    <div style={{ fontSize: 13, color: '#34d399', fontWeight: 600 }}>
                      ✓ Sent {sendResult.sent}{sendResult.noEmail ? `, ${sendResult.noEmail} skipped` : ''}{sendResult.errors ? `, ${sendResult.errors} errors` : ''}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button className="btn btn-primary" style={{ fontSize: 13 }} onClick={approveSend} disabled={sending || selectedVenueIds.size === 0}>
                      {sending ? 'Sending…' : `Send to ${selectedVenueIds.size} venue${selectedVenueIds.size !== 1 ? 's' : ''}`}
                    </button>
                    <button className="btn btn-secondary" style={{ fontSize: 13 }} onClick={() => { setPendingAction(null); setSendResult(null); }} disabled={sending}>Cancel</button>
                  </div>
                </div>
              )}
            </div>

            {/* Quick chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', padding: '0.6rem 1.25rem 0', flexShrink: 0 }}>
              {QUICK_CHIPS.map(chip =>
                chip.href ? (
                  <Link key={chip.label} href={chip.href} style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, padding: '0.22rem 0.65rem', border: '1px solid var(--border)', color: 'var(--text-muted)', textDecoration: 'none', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                    {chip.label}
                  </Link>
                ) : (
                  <button key={chip.label} onClick={() => sendMessage(chip.prompt!)} disabled={agentLoading} style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500, padding: '0.22rem 0.65rem', border: '1px solid var(--border)', color: 'var(--text-muted)', background: 'transparent', cursor: 'pointer', transition: 'all 0.15s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}>
                    {chip.label}
                  </button>
                )
              )}
            </div>

            {agentError && <div style={{ margin: '0.4rem 1.25rem 0', fontSize: 13, color: '#f87171' }}>{agentError}</div>}

            {/* Input */}
            <div style={{ display: 'flex', gap: '0.5rem', padding: '0.75rem 1.25rem', borderTop: '1px solid var(--border)', flexShrink: 0 }}>
              <input className="input" style={{ flex: 1, fontSize: 14 }}
                placeholder={`Ask about ${myAct?.act_name || 'your pipeline'}, or say "send outreach to all targets on [tour name]"…`}
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

          {/* ── Bottom tiles ─────────────────────────────────────────────────── */}
          <div className="dash-tiles-grid">
            {([
              { label: 'SOCIALS',    sub: 'Social post queue',     href: '/social',     accent: '#e879f9', icon: '✦' },
              { label: 'CALENDAR',   sub: 'View all shows',        href: '/calendar',   accent: '#60a5fa', icon: '◷' },
              { label: 'FINANCIALS', sub: 'Track payments & fees', href: '/financials', accent: '#34d399', icon: '$' },
              { label: 'HISTORY',    sub: 'Past shows & notes',    href: '/history',   accent: '#f59e0b', icon: '◎' },
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
