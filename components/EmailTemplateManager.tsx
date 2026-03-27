'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────
interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  variables: string[];
  created_at: string;
  user_id?: string;
}

interface Venue {
  id: string;
  name: string;
  email: string;
  city: string;
  state: string;
  address?: string;
  phone?: string;
  booking_contact?: string;
}

// ─── Template definitions ─────────────────────────────────────────────────────
const TEMPLATE_TILES = [
  {
    id: 'initial',
    name: 'Initial Venue Inquiry',
    description: 'First contact with a new venue',
    accent: '#3a7fc1',
    glow: 'rgba(58,127,193,0.15)',
    border: 'rgba(58,127,193,0.3)',
  },
  {
    id: 'followup',
    name: 'Follow-Up',
    description: 'Check in after no response',
    accent: '#f59e0b',
    glow: 'rgba(245,158,11,0.12)',
    border: 'rgba(245,158,11,0.28)',
  },
  {
    id: 'confirmation',
    name: 'Booking Confirmation',
    description: 'Confirm a booked date',
    accent: '#22c55e',
    glow: 'rgba(34,197,94,0.12)',
    border: 'rgba(34,197,94,0.28)',
  },
  {
    id: 'thankyou',
    name: 'Post-Show Thank You',
    description: 'Thank you after a performance',
    accent: '#a78bfa',
    glow: 'rgba(167,139,250,0.12)',
    border: 'rgba(167,139,250,0.28)',
  },
];

// Default template bodies
const DEFAULT_TEMPLATES: Record<string, { subject: string; body: string }> = {
  initial: {
    subject: "Live Music Booking Inquiry — {{band_name}}",
    body: `Hello {{booking_contact}},

I hope this message finds you well! My name is {{sender_name}} and I represent {{band_name}}, an Ozark Country band based in Northwest Arkansas.

We're currently booking shows and came across {{venue_name}} in {{city}}. We love what you're doing with live music and think our high-energy country sound would be a great fit for your venue.

{{band_name}} delivers authentic Ozark Country with a mix of classic covers and original songs. We typically play 3–4 hour sets and have experience playing venues ranging from intimate clubs to larger dance halls.

Would you be interested in discussing available dates? We're very flexible on scheduling.

Looking forward to hearing from you!

Best regards,
{{sender_name}}
{{band_name}}
{{sender_email}}
{{sender_phone}}`,
  },
  followup: {
    subject: "Following Up — {{band_name}} Booking Inquiry",
    body: `Hello {{booking_contact}},

I wanted to follow up on my previous message about booking {{band_name}} at {{venue_name}}.

I know things get busy, so I just wanted to make sure my inquiry didn't slip through the cracks. We'd love the opportunity to bring our Ozark Country sound to your venue.

If you have any questions or would like to discuss available dates, please don't hesitate to reach out.

Thanks for your time!

Best regards,
{{sender_name}}
{{band_name}}
{{sender_email}}
{{sender_phone}}`,
  },
  confirmation: {
    subject: "Booking Confirmed — {{band_name}} at {{venue_name}}",
    body: `Hello {{booking_contact}},

We're thrilled to confirm our booking at {{venue_name}}!

Here are the details as we understand them:
- Venue: {{venue_name}}, {{city}}
- Date: {{show_date}}
- Set time: {{show_time}}
- Set length: {{set_length}}

Please let us know if any of these details need adjusting. We'll be in touch closer to the date with our full set list and any technical requirements.

We're really looking forward to playing for your crowd!

Best,
{{sender_name}}
{{band_name}}
{{sender_email}}
{{sender_phone}}`,
  },
  thankyou: {
    subject: "Thank You — {{band_name}}",
    body: `Hello {{booking_contact}},

We just wanted to say a huge thank you for having us at {{venue_name}} on {{show_date}}.

Your staff was incredibly welcoming and the crowd was fantastic — exactly the kind of venue we love playing. We hope the night was a success for you as well.

We'd love to come back in the future. Please keep us in mind for upcoming dates!

Warmly,
{{sender_name}}
{{band_name}}
{{sender_email}}
{{sender_phone}}`,
  },
};

export default function EmailTemplateManager() {
  const [templates, setTemplates]         = useState<Record<string, EmailTemplate>>({});
  const [venues, setVenues]               = useState<Venue[]>([]);
  const [loading, setLoading]             = useState(true);
  const [user, setUser]                   = useState<any>(null);

  // View state — null = tile grid, string = edit/send view
  const [activeTemplate, setActiveTemplate] = useState<string | null>(null);
  const [view, setView]                   = useState<'edit' | 'send'>('edit');

  // Edit state
  const [editSubject, setEditSubject]     = useState('');
  const [editBody, setEditBody]           = useState('');
  const [saving, setSaving]               = useState(false);
  const [saveMsg, setSaveMsg]             = useState('');

  // Send state
  const [venueSearch, setVenueSearch]     = useState('');
  const [selectedVenue, setSelectedVenue] = useState<Venue | null>(null);
  const [showVenueDrop, setShowVenueDrop] = useState(false);
  const [sendTo, setSendTo]               = useState('');
  const [sendSubject, setSendSubject]     = useState('');
  const [sendBody, setSendBody]           = useState('');
  const [sending, setSending]             = useState(false);
  const [sendMsg, setSendMsg]             = useState('');

  useEffect(() => {
    const local = localStorage.getItem('loggedInUser');
    if (local) setUser(JSON.parse(local));
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const local = localStorage.getItem('loggedInUser');
      const userId = local ? JSON.parse(local).id : null;

      // Load saved templates for this user
      if (userId) {
        const { data } = await supabase
          .from('email_templates')
          .select('*')
          .eq('user_id', userId);
        const map: Record<string, EmailTemplate> = {};
        (data || []).forEach((t: EmailTemplate) => {
          // Map by template category if stored in name
          const key = TEMPLATE_TILES.find(ti =>
            t.name.toLowerCase().includes(ti.id) ||
            ti.name.toLowerCase().includes(t.name.toLowerCase().split(' ')[0])
          )?.id || t.id;
          map[key] = t;
        });
        setTemplates(map);
      }

      // Load venues with emails for send dropdown
      const { data: venueData } = await supabase
        .from('venues')
        .select('id,name,email,city,state,address,phone,booking_contact')
        .not('email', 'is', null)
        .order('name');
      setVenues(venueData || []);
    } catch (err) {
      console.error('Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  // Open a template for editing
  const openTemplate = (id: string) => {
    const saved = templates[id];
    const defaults = DEFAULT_TEMPLATES[id];
    setEditSubject(saved?.subject || defaults?.subject || '');
    setEditBody(saved?.body || defaults?.body || '');
    setActiveTemplate(id);
    setView('edit');
    setSaveMsg('');
    setSendMsg('');
  };

  // Save template to DB
  const saveTemplate = async () => {
    if (!activeTemplate) return;
    const local = localStorage.getItem('loggedInUser');
    const userId = local ? JSON.parse(local).id : null;
    if (!userId) return;

    setSaving(true);
    setSaveMsg('');
    try {
      const tile = TEMPLATE_TILES.find(t => t.id === activeTemplate)!;
      const existing = templates[activeTemplate];

      if (existing?.id) {
        await supabase.from('email_templates')
          .update({ subject: editSubject, body: editBody })
          .eq('id', existing.id);
      } else {
        await supabase.from('email_templates').insert({
          name: tile.name,
          subject: editSubject,
          body: editBody,
          variables: extractVariables(editBody + ' ' + editSubject),
          user_id: userId,
        });
      }
      setSaveMsg('Saved');
      await loadData();
      setTimeout(() => setSaveMsg(''), 2500);
    } catch (err) {
      console.error(err);
      setSaveMsg('Save failed');
    } finally {
      setSaving(false);
    }
  };

  // Switch to send view — pre-fill with selected venue
  const openSend = (venue?: Venue) => {
    const v = venue || selectedVenue;
    const subject = fillVars(editSubject, v);
    const body    = fillVars(editBody, v);
    setSendTo(v?.email || '');
    setSendSubject(subject);
    setSendBody(body);
    if (v) setSelectedVenue(v);
    setView('send');
    setSendMsg('');
  };

  // Fill template variables with venue data
  const fillVars = (text: string, venue?: Venue | null): string => {
    const local = localStorage.getItem('loggedInUser');
    const u = local ? JSON.parse(local) : {};
    return text
      .replace(/{{venue_name}}/g, venue?.name || '')
      .replace(/{{city}}/g, venue?.city || '')
      .replace(/{{state}}/g, venue?.state || '')
      .replace(/{{booking_contact}}/g, venue?.booking_contact || 'there')
      .replace(/{{band_name}}/g, u.bandName || "Better Than Nothin'")
      .replace(/{{sender_name}}/g, u.bandName || 'Scott')
      .replace(/{{sender_email}}/g, u.email || '')
      .replace(/{{sender_phone}}/g, '')
      .replace(/{{show_date}}/g, '{{show_date}}')
      .replace(/{{show_time}}/g, '{{show_time}}')
      .replace(/{{set_length}}/g, '3–4 hours');
  };

  // Extract {{variables}} from template text
  const extractVariables = (text: string): string[] => {
    const matches = text.match(/{{(\w+)}}/g) || [];
    return [...new Set(matches.map(m => m.replace(/[{}]/g, '')))];
  };

  // Send email via API
  const sendEmail = async () => {
    if (!sendTo || !sendSubject || !sendBody) return;
    setSending(true);
    setSendMsg('');
    try {
      const res = await fetch('/api/email/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: sendTo, subject: sendSubject, body: sendBody,
          venueId: selectedVenue?.id,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Send failed');
      setSendMsg('sent');
      setTimeout(() => { setSendMsg(''); setView('edit'); }, 2500);
    } catch (err: any) {
      setSendMsg('error:' + err.message);
    } finally {
      setSending(false);
    }
  };

  // Filtered venues for dropdown
  const filteredVenues = venueSearch.trim()
    ? venues.filter(v =>
        v.name.toLowerCase().includes(venueSearch.toLowerCase()) ||
        v.city.toLowerCase().includes(venueSearch.toLowerCase())
      )
    : venues.slice(0, 20);

  const tile = TEMPLATE_TILES.find(t => t.id === activeTemplate);

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center',
      minHeight:400, background:'#030d18', fontFamily:"'Nunito',sans-serif",
      color:'#3d6285', fontSize:15 }}>Loading templates…</div>
  );

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .em-wrap {
          background: #030d18; min-height: 100vh;
          padding: 2rem; font-family: 'Nunito', sans-serif;
        }
        .em-input {
          background: rgba(9,24,40,0.9); border: 1px solid rgba(74,133,200,0.22);
          border-radius: 9px; padding: 10px 14px; color: #e8f1f8;
          font-family: 'Nunito', sans-serif; font-size: 14px;
          outline: none; transition: border-color .2s; width: 100%;
        }
        .em-input::placeholder { color: #3d6285; }
        .em-input:focus { border-color: rgba(74,133,200,0.55); }
        .em-textarea {
          background: rgba(9,24,40,0.9); border: 1px solid rgba(74,133,200,0.22);
          border-radius: 9px; padding: 14px; color: #e8f1f8;
          font-family: 'Nunito', sans-serif; font-size: 14px; line-height: 1.7;
          outline: none; transition: border-color .2s; width: 100%;
          resize: vertical; min-height: 380px;
        }
        .em-textarea:focus { border-color: rgba(74,133,200,0.55); }
        .em-btn-primary {
          background: linear-gradient(135deg,#3a7fc1,#2563a8);
          border: none; border-radius: 9px; color: #e8f1f8;
          font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 14px;
          padding: 10px 24px; cursor: pointer;
          box-shadow: 0 4px 16px rgba(37,99,168,0.35);
          transition: transform .15s, box-shadow .15s;
        }
        .em-btn-primary:hover:not(:disabled) {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(37,99,168,0.5);
        }
        .em-btn-primary:disabled { opacity: .55; cursor: not-allowed; }
        .em-btn-ghost {
          background: transparent; border: 1px solid rgba(74,133,200,0.28);
          border-radius: 8px; color: #6baed6;
          font-family: 'Nunito', sans-serif; font-size: 13px; font-weight: 700;
          padding: 8px 18px; cursor: pointer; transition: background .15s;
        }
        .em-btn-ghost:hover { background: rgba(74,133,200,0.1); }
        .em-btn-success {
          background: linear-gradient(135deg,#16a34a,#15803d);
          border: none; border-radius: 9px; color: #e8f1f8;
          font-family: 'Nunito', sans-serif; font-weight: 800; font-size: 14px;
          padding: 10px 28px; cursor: pointer;
          box-shadow: 0 4px 16px rgba(22,163,74,0.35);
          transition: transform .15s, box-shadow .15s;
        }
        .em-btn-success:hover:not(:disabled) {
          transform: translateY(-2px); box-shadow: 0 8px 24px rgba(22,163,74,0.5);
        }
        .em-btn-success:disabled { opacity: .55; cursor: not-allowed; }

        /* Tile cards */
        .em-tile {
          background: rgba(9,24,40,0.8);
          border-radius: 14px; padding: 1.75rem 1.5rem;
          cursor: pointer; position: relative; overflow: hidden;
          transition: transform .18s, box-shadow .18s, border-color .18s;
          border: 1px solid;
        }
        .em-tile:hover {
          transform: translateY(-4px);
        }
        .em-tile .glow-orb {
          position: absolute; top: -30px; right: -30px;
          width: 120px; height: 120px; border-radius: 50%;
          filter: blur(30px); pointer-events: none; opacity: .6;
        }

        /* Venue dropdown */
        .em-venue-drop {
          position: absolute; top: calc(100% + 4px); left: 0; right: 0; z-index: 60;
          background: #091828; border: 1px solid rgba(74,133,200,0.2);
          border-radius: 10px; max-height: 240px; overflow-y: auto;
          box-shadow: 0 12px 32px rgba(0,0,0,0.5); padding: 6px;
        }
        .em-venue-opt {
          display: block; width: 100%; padding: 9px 12px;
          background: transparent; border: none; border-radius: 7px;
          color: #e8f1f8; font-family: 'Nunito',sans-serif;
          font-size: 13px; font-weight: 600; text-align: left; cursor: pointer;
          transition: background .12s;
        }
        .em-venue-opt:hover { background: rgba(74,133,200,0.1); }

        label.em-label {
          display: block; color: #7aa5c4; font-size: 12px;
          font-weight: 700; margin-bottom: 6px; letter-spacing: 0.04em;
        }
      `}</style>

      <div className="em-wrap">
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* ── Tile grid ─────────────────────────────────────────────────── */}
          {!activeTemplate && (
            <>
              <div style={{ marginBottom: '1.75rem' }}>
                <h1 style={{ fontFamily:"'Bebas Neue',cursive", fontWeight:400,
                  fontSize:'clamp(1.8rem,3vw,2.4rem)', letterSpacing:'0.06em',
                  color:'#ffffff', margin:0, lineHeight:1 }}>Email Templates</h1>
                <p style={{ color:'#3d6285', margin:'5px 0 0', fontSize:13, fontWeight:600 }}>
                  Select a template to edit or send
                </p>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))', gap:18 }}>
                {TEMPLATE_TILES.map(tile => {
                  const isSaved = !!templates[tile.id];
                  return (
                    <div key={tile.id} className="em-tile"
                      style={{ borderColor: tile.border }}
                      onClick={() => openTemplate(tile.id)}>
                      <div className="glow-orb" style={{ background: tile.glow }} />
                      {/* Saved indicator */}
                      {isSaved && (
                        <div style={{ position:'absolute', top:12, right:12,
                          background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.3)',
                          borderRadius:99, padding:'2px 10px',
                          color:'#22c55e', fontSize:11, fontWeight:700 }}>Saved</div>
                      )}
                      {/* Accent bar */}
                      <div style={{ width:40, height:4, borderRadius:99,
                        background:tile.accent, marginBottom:16 }} />
                      <div style={{ color:'#ffffff', fontWeight:800, fontSize:15,
                        marginBottom:6, lineHeight:1.3 }}>
                        {tile.name}
                      </div>
                      <div style={{ color:'#3d6285', fontSize:13, marginBottom:18, fontWeight:600 }}>
                        {tile.description}
                      </div>
                      <div style={{ display:'flex', gap:8 }}>
                        <span style={{ background:tile.glow, border:`1px solid ${tile.border}`,
                          borderRadius:7, padding:'5px 14px', color:tile.accent,
                          fontSize:12, fontWeight:700 }}>
                          Edit Template
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* ── Edit / Send view ──────────────────────────────────────────── */}
          {activeTemplate && tile && (
            <>
              {/* Header */}
              <div style={{ display:'flex', alignItems:'center', gap:14,
                flexWrap:'wrap', marginBottom:'1.5rem' }}>
                <button className="em-btn-ghost"
                  onClick={() => { setActiveTemplate(null); setSelectedVenue(null); }}>
                  ← Templates
                </button>
                <div style={{ flex:1 }}>
                  <h1 style={{ fontFamily:"'Bebas Neue',cursive", fontWeight:400,
                    fontSize:'clamp(1.6rem,3vw,2.2rem)', letterSpacing:'0.06em',
                    color:'#ffffff', margin:0, lineHeight:1 }}>
                    {tile.name}
                  </h1>
                </div>
                {/* View toggle */}
                <div style={{ display:'flex', gap:0,
                  background:'rgba(9,24,40,0.9)', border:'1px solid rgba(74,133,200,0.2)',
                  borderRadius:10, overflow:'hidden' }}>
                  {(['edit','send'] as const).map(v => (
                    <button key={v} onClick={() => { setView(v); if (v==='send') openSend(); }}
                      style={{ padding:'8px 20px', border:'none', cursor:'pointer',
                        background: view===v ? 'rgba(58,127,193,0.25)' : 'transparent',
                        color: view===v ? '#e8f1f8' : '#3d6285',
                        fontFamily:"'Nunito',sans-serif", fontWeight:800, fontSize:13,
                        textTransform:'capitalize', transition:'all .15s' }}>
                      {v === 'edit' ? 'Edit' : 'Send'}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── EDIT TAB ──────────────────────────────────────────────── */}
              {view === 'edit' && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:20 }}>

                  {/* Left: editor */}
                  <div style={{ background:'rgba(9,24,40,0.8)',
                    border:'1px solid rgba(74,133,200,0.12)',
                    borderRadius:14, padding:'1.5rem' }}>
                    <div style={{ marginBottom:14 }}>
                      <label className="em-label">Subject Line</label>
                      <input className="em-input" value={editSubject}
                        onChange={e => setEditSubject(e.target.value)}
                        placeholder="Email subject…" />
                    </div>
                    <div>
                      <label className="em-label">Message Body</label>
                      <textarea className="em-textarea" value={editBody}
                        onChange={e => setEditBody(e.target.value)}
                        placeholder="Email body…" />
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:12, marginTop:14 }}>
                      <button className="em-btn-primary" onClick={saveTemplate}
                        disabled={saving}>
                        {saving ? 'Saving…' : 'Save Template'}
                      </button>
                      <button className="em-btn-success"
                        onClick={() => { openSend(); setView('send'); }}>
                        Send Email →
                      </button>
                      {saveMsg && (
                        <span style={{ color: saveMsg === 'Saved' ? '#22c55e' : '#f87171',
                          fontSize:13, fontWeight:700 }}>
                          {saveMsg === 'Saved' ? '✓ Saved' : '✕ ' + saveMsg}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: variable reference */}
                  <div style={{ background:'rgba(9,24,40,0.6)',
                    border:'1px solid rgba(74,133,200,0.1)',
                    borderRadius:14, padding:'1.25rem' }}>
                    <div style={{ color:'#ffffff', fontWeight:800, fontSize:13, marginBottom:12 }}>
                      Template Variables
                    </div>
                    <p style={{ color:'#3d6285', fontSize:12, marginBottom:14, lineHeight:1.6 }}>
                      These placeholders are replaced automatically when you send.
                    </p>
                    {[
                      ['{{venue_name}}',     'Venue name'],
                      ['{{city}}',           'City'],
                      ['{{state}}',          'State'],
                      ['{{booking_contact}}','Booking contact'],
                      ['{{band_name}}',      'Your band name'],
                      ['{{sender_name}}',    'Your name'],
                      ['{{sender_email}}',   'Your email'],
                      ['{{sender_phone}}',   'Your phone'],
                      ['{{show_date}}',      'Show date'],
                      ['{{show_time}}',      'Show time'],
                    ].map(([v, label]) => (
                      <div key={v} style={{ display:'flex', justifyContent:'space-between',
                        alignItems:'center', padding:'5px 0',
                        borderBottom:'1px solid rgba(74,133,200,0.07)' }}>
                        <code style={{ color: tile.accent, fontSize:11, fontWeight:700 }}>{v}</code>
                        <span style={{ color:'#3d6285', fontSize:11 }}>{label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── SEND TAB ──────────────────────────────────────────────── */}
              {view === 'send' && (
                <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:20 }}>

                  {/* Left: compose */}
                  <div style={{ background:'rgba(9,24,40,0.8)',
                    border:'1px solid rgba(74,133,200,0.12)',
                    borderRadius:14, padding:'1.5rem',
                    display:'flex', flexDirection:'column', gap:14 }}>

                    {/* Venue picker */}
                    <div>
                      <label className="em-label">Venue</label>
                      <div style={{ position:'relative' }}>
                        <input className="em-input" value={venueSearch}
                          placeholder="Search venue name or city…"
                          onChange={e => { setVenueSearch(e.target.value); setShowVenueDrop(true); }}
                          onFocus={() => setShowVenueDrop(true)} />
                        {showVenueDrop && (
                          <>
                            <div style={{ position:'fixed', inset:0, zIndex:59 }}
                              onClick={() => setShowVenueDrop(false)} />
                            <div className="em-venue-drop">
                              {filteredVenues.length === 0 ? (
                                <div style={{ padding:'12px 14px', color:'#3d6285', fontSize:13 }}>
                                  No venues found
                                </div>
                              ) : filteredVenues.map(v => (
                                <button key={v.id} className="em-venue-opt"
                                  onClick={() => {
                                    setSelectedVenue(v);
                                    setVenueSearch(v.name);
                                    setShowVenueDrop(false);
                                    setSendTo(v.email || '');
                                    setSendSubject(fillVars(editSubject, v));
                                    setSendBody(fillVars(editBody, v));
                                  }}>
                                  <span style={{ fontWeight:800 }}>{v.name}</span>
                                  <span style={{ color:'#3d6285', marginLeft:8 }}>{v.city}, {v.state}</span>
                                  {v.email && <span style={{ color:'#22c55e', marginLeft:8, fontSize:12 }}>{v.email}</span>}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    {/* To */}
                    <div>
                      <label className="em-label">To</label>
                      <input className="em-input" type="email" value={sendTo}
                        onChange={e => setSendTo(e.target.value)}
                        placeholder="recipient@venue.com" />
                    </div>

                    {/* Subject */}
                    <div>
                      <label className="em-label">Subject</label>
                      <input className="em-input" value={sendSubject}
                        onChange={e => setSendSubject(e.target.value)} />
                    </div>

                    {/* Body */}
                    <div>
                      <label className="em-label">Message</label>
                      <textarea className="em-textarea" value={sendBody}
                        onChange={e => setSendBody(e.target.value)} />
                    </div>

                    {/* Send button */}
                    <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                      <button className="em-btn-success" onClick={sendEmail}
                        disabled={sending || !sendTo || !sendSubject}>
                        {sending ? 'Sending…' : '✉ Send Email'}
                      </button>
                      {sendMsg === 'sent' && (
                        <span style={{ color:'#22c55e', fontWeight:700, fontSize:13 }}>✓ Email sent!</span>
                      )}
                      {sendMsg.startsWith('error:') && (
                        <span style={{ color:'#f87171', fontWeight:700, fontSize:13 }}>
                          ✕ {sendMsg.replace('error:', '')}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right: selected venue info */}
                  <div style={{ background:'rgba(9,24,40,0.6)',
                    border:'1px solid rgba(74,133,200,0.1)',
                    borderRadius:14, padding:'1.25rem' }}>
                    <div style={{ color:'#ffffff', fontWeight:800, fontSize:13, marginBottom:12 }}>
                      {selectedVenue ? 'Selected Venue' : 'Venue Details'}
                    </div>
                    {!selectedVenue ? (
                      <p style={{ color:'#3d6285', fontSize:13 }}>
                        Search for a venue above to pre-fill the template variables.
                      </p>
                    ) : (
                      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                        {[
                          { label:'Venue',   value: selectedVenue.name },
                          { label:'City',    value: `${selectedVenue.city}, ${selectedVenue.state}` },
                          { label:'Email',   value: selectedVenue.email },
                          { label:'Phone',   value: selectedVenue.phone },
                          { label:'Contact', value: selectedVenue.booking_contact },
                        ].map(({ label, value }) => value ? (
                          <div key={label}>
                            <div style={{ color:'#3d6285', fontSize:11, fontWeight:700,
                              textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>
                              {label}
                            </div>
                            <div style={{ color:'#e8f1f8', fontSize:13, fontWeight:600 }}>{value}</div>
                          </div>
                        ) : null)}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

        </div>
      </div>
    </>
  );
}
