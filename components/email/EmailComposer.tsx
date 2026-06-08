import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

const CATEGORY_LABELS: Record<string, string> = {
  target:       'Cold Pitch',
  follow_up_1:  'Follow Up 1',
  follow_up_2:  'Follow Up 2',
  confirmation: 'Confirmation',
  decline:      'Decline',
  advance:      'Advance',
  thank_you:    'Thank You',
};

const CATEGORY_ORDER = ['target','follow_up_1','follow_up_2','confirmation','advance','thank_you','decline'];

const CATEGORY_COLORS: Record<string, string> = {
  target:       '#60a5fa',
  follow_up_1:  '#fbbf24',
  follow_up_2:  '#f97316',
  confirmation: '#34d399',
  decline:      '#94a3b8',
  advance:      '#f97316',
  thank_you:    '#a78bfa',
};

type Stage = 'idle' | 'loading' | 'preview' | 'editing' | 'sending' | 'sent';

interface Props {
  bookingId?: string;
  tourVenueId?: string;
  actId: string;
  venueId?: string;
  contactId?: string;
  contactEmail?: string;
  defaultCategory: string;
  agentName?: string;
  initialSubject?: string;
  initialBody?: string;
  draftId?: string;
  onClose: (didSend?: boolean) => void;
}

interface CtxData {
  actName: string;
  venueName: string;
  city: string;
  state: string;
  bookingContact: string;
  agentName: string;
  date1: string;
}

function applyVars(text: string, ctx: CtxData): string {
  return text
    .replace(/\{\{band_name\}\}/gi,        ctx.actName)
    .replace(/\{\{venue_name\}\}/gi,       ctx.venueName)
    .replace(/\{\{city\}\}/gi,             ctx.city)
    .replace(/\{\{state\}\}/gi,            ctx.state)
    .replace(/\{\{booking_contact\}\}/gi,  ctx.bookingContact)
    .replace(/\{\{agent_name\}\}/gi,       ctx.agentName)
    .replace(/\{\{display_name\}\}/gi,     ctx.agentName)
    .replace(/\[Band Name\]/g,             ctx.actName)
    .replace(/\[Venue Name\]/g,            ctx.venueName)
    .replace(/\[Date 1\]/g,               ctx.date1);
}

export default function EmailComposer({
  bookingId, tourVenueId, actId, venueId, contactId, contactEmail,
  defaultCategory, agentName: agentNameProp, initialSubject, initialBody, draftId, onClose,
}: Props) {
  const hasInitial = !!(initialSubject || initialBody);

  const [stage, setStage]         = useState<Stage>(hasInitial ? 'preview' : 'idle');
  const [category, setCategory]   = useState(defaultCategory);
  const [subject, setSubject]     = useState(initialSubject || '');
  const [body, setBody]           = useState(initialBody || '');
  const [to, setTo]               = useState(contactEmail || '');
  const [error, setError]         = useState('');

  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedTmplId, setSelectedTmplId] = useState('');

  const [ctx, setCtx]             = useState<CtxData>({ actName: '', venueName: '', city: '', state: '', bookingContact: '', agentName: agentNameProp || '', date1: '' });

  const [currentDraftId, setCurrentDraftId] = useState(draftId || '');
  const [draftSaving, setDraftSaving]       = useState(false);
  const [draftSaved, setDraftSaved]         = useState(false);

  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved]   = useState(false);

  useEffect(() => {
    loadCtx();
    loadTemplates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadCtx = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const [actRes, profileRes] = await Promise.all([
      supabase.from('acts').select('act_name').eq('id', actId).maybeSingle(),
      supabase.from('profiles').select('display_name').eq('id', session.user.id).maybeSingle(),
    ]);

    let venueName = '', city = '', state = '', bookingContact = '';
    let date1 = '';

    if (venueId) {
      const { data: v } = await supabase.from('venues').select('name, city, state').eq('id', venueId).maybeSingle();
      if (v) { venueName = v.name || ''; city = v.city || ''; state = v.state || ''; }
    }

    if (contactId) {
      const { data: c } = await supabase.from('contacts').select('first_name, last_name').eq('id', contactId).maybeSingle();
      if (c) bookingContact = `${c.first_name || ''} ${c.last_name || ''}`.trim();
    }

    if (bookingId) {
      const { data: bk } = await supabase.from('bookings').select('show_date').eq('id', bookingId).maybeSingle();
      if (bk?.show_date) {
        date1 = new Date(bk.show_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      }
    }

    setCtx({
      actName:        actRes.data?.act_name || '',
      venueName,
      city,
      state,
      bookingContact,
      agentName:      agentNameProp || profileRes.data?.display_name || '',
      date1,
    });
  };

  const loadTemplates = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const res = await fetch(`/api/email/templates?actId=${actId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const data = await res.json();
      const sorted = (data.templates || []).sort((a: any, b: any) => {
        const ai = CATEGORY_ORDER.indexOf(a.category);
        const bi = CATEGORY_ORDER.indexOf(b.category);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      setTemplates(sorted);
    } catch {}
  };

  const pickTemplate = (id: string) => {
    setSelectedTmplId(id);
    if (!id) return;
    const tmpl = templates.find(t => t.id === id);
    if (!tmpl) return;
    setSubject(applyVars(tmpl.subject || '', ctx));
    setBody(applyVars(tmpl.body || '', ctx));
    if (tmpl.category) setCategory(tmpl.category);
    setStage('preview');
  };

  const generateWithAI = async () => {
    setStage('loading');
    setError('');
    const { data: { session } } = await supabase.auth.getSession();
    const auth = `Bearer ${session?.access_token}`;
    try {
      const res = await fetch('/api/email/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ category, bookingId, actId, venueId, contactId, agentName: ctx.agentName, agencyName: 'Camel Ranch Booking' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to generate draft');
        setStage('idle');
        return;
      }
      setSubject(data.draft.subject || '');
      setBody(data.draft.body || '');
      setStage('preview');
    } catch (e: any) {
      setError(e.message || 'Failed to generate draft');
      setStage('idle');
    }
  };

  const saveDraft = async () => {
    setDraftSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    try {
      const res = await fetch('/api/email/save-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          draftId:     currentDraftId || undefined,
          actId,       venueId:      venueId     || null,
          tourVenueId: tourVenueId   || null,
          bookingId:   bookingId     || null,
          contactId:   contactId     || null,
          recipient:   to            || null,
          subject,     body,          category,
        }),
      });
      const data = await res.json();
      if (data.id) {
        setCurrentDraftId(data.id);
        setDraftSaved(true);
        setTimeout(() => setDraftSaved(false), 3000);
      }
    } catch {}
    setDraftSaving(false);
  };

  const saveAsTemplate = async () => {
    setSavingTemplate(true);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/email/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ actId, category, subject, body }),
    });
    setSavingTemplate(false);
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 3000);
    loadTemplates();
  };

  const send = async () => {
    if (!to) { setError('Recipient email required'); return; }
    setStage('sending');
    const { data: { session } } = await supabase.auth.getSession();
    const html = body.replace(/\n/g, '<br>');
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({
        to, subject, html,
        bookingId:   bookingId   || null,
        tourVenueId: tourVenueId || null,
        venueId:     venueId     || null,
        contactId:   contactId   || null,
        actId, category, bodyPreview: body,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Send failed'); setStage('preview'); return; }

    if (currentDraftId) {
      await supabase.from('email_log').delete().eq('id', currentDraftId).eq('is_draft', true);
    }
    if (draftId) {
      await supabase.from('email_drafts').delete().eq('id', draftId);
    }

    setStage('sent');
  };

  // ── Styles ──
  const mono = 'var(--font-mono)';
  const body_font = 'var(--font-body)';

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#fff', border: '1px solid #ddd',
    borderRadius: '4px', padding: '0.4rem 0.6rem',
    fontSize: '0.88rem', color: '#1a1a2e', fontFamily: body_font,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: mono, fontSize: '0.68rem', textTransform: 'uppercase',
    letterSpacing: '0.1em', color: '#888', marginBottom: '0.25rem',
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#f5f3ee', borderRadius: 'var(--radius)', width: '100%', maxWidth: 580, position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* ── Header ── */}
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '1px solid #e8e5df', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <span style={{ background: `${CATEGORY_COLORS[category]}22`, color: CATEGORY_COLORS[category], fontFamily: mono, fontSize: '0.72rem', letterSpacing: '0.1em', textTransform: 'uppercase', padding: '0.2rem 0.6rem', borderRadius: '3px' }}>
              {CATEGORY_LABELS[category] || category}
            </span>
            <button onClick={() => onClose()} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
          </div>

          {/* Category selector */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {Object.keys(CATEGORY_LABELS).map(c => (
              <button key={c} onClick={() => setCategory(c)}
                style={{ fontFamily: mono, fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '3px', border: `1px solid ${category === c ? CATEGORY_COLORS[c] : '#ddd'}`, background: category === c ? `${CATEGORY_COLORS[c]}18` : 'transparent', color: category === c ? CATEGORY_COLORS[c] : '#aaa', cursor: 'pointer' }}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {/* ── Content ── */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>

          {/* IDLE: template selector */}
          {stage === 'idle' && (
            <div>
              {templates.length > 0 && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <div style={labelStyle}>Use a saved template</div>
                  <select
                    value={selectedTmplId}
                    onChange={e => pickTemplate(e.target.value)}
                    style={{ ...inputStyle, cursor: 'pointer', appearance: 'auto' }}
                  >
                    <option value="">Select a template…</option>
                    {templates.map(t => (
                      <option key={t.id} value={t.id}>
                        {CATEGORY_LABELS[t.category] || t.category}
                        {t.subject ? ` — ${t.subject.slice(0, 48)}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {templates.length === 0 && (
                <div style={{ fontFamily: body_font, fontSize: '0.84rem', color: '#999', marginBottom: '1.25rem', textAlign: 'center', padding: '1rem 0' }}>
                  No saved templates yet.
                </div>
              )}

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                {templates.length > 0 && <div style={{ height: '1px', background: '#ddd', flex: 1 }} />}
                <button
                  onClick={generateWithAI}
                  style={{ fontFamily: mono, fontSize: '0.78rem', letterSpacing: '0.06em', padding: '0.5rem 1.1rem', borderRadius: '4px', border: '1px solid #1a1a2e', background: '#1a1a2e', color: '#f5f3ee', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  ✨ Generate with AI
                </button>
                {templates.length > 0 && <div style={{ height: '1px', background: '#ddd', flex: 1 }} />}
              </div>
              {error && <div style={{ color: '#ef4444', fontFamily: body_font, fontSize: '0.82rem', marginTop: '0.75rem' }}>{error}</div>}
            </div>
          )}

          {stage === 'loading' && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888', fontFamily: body_font, fontSize: '0.84rem' }}>
              Drafting email…
            </div>
          )}

          {stage === 'sent' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✓</div>
              <div style={{ color: '#1a1a2e', fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Email Sent</div>
              <div style={{ color: '#888', fontFamily: body_font, fontSize: '0.84rem', marginBottom: '1.5rem' }}>to {to}</div>
              <button className="btn btn-primary" onClick={() => onClose(true)} style={{ background: '#1a1a2e', borderColor: '#1a1a2e', color: '#f5f3ee' }}>Done</button>
            </div>
          )}

          {(stage === 'preview' || stage === 'sending') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div><div style={labelStyle}>To</div>
                <input value={to} onChange={e => setTo(e.target.value)} placeholder="venue@example.com" style={inputStyle} />
              </div>
              <div><div style={labelStyle}>Subject</div>
                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '0.88rem', color: '#1a1a2e', fontFamily: body_font }}>{subject || '—'}</div>
              </div>
              <div><div style={labelStyle}>Body</div>
                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '4px', padding: '0.75rem', fontSize: '0.86rem', color: '#1a1a2e', fontFamily: body_font, lineHeight: 1.7, whiteSpace: 'pre-wrap', minHeight: 120 }}>{body}</div>
              </div>
            </div>
          )}

          {stage === 'editing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div><div style={labelStyle}>To</div>
                <input value={to} onChange={e => setTo(e.target.value)} style={inputStyle} />
              </div>
              <div><div style={labelStyle}>Subject</div>
                <input value={subject} onChange={e => setSubject(e.target.value)} style={inputStyle} />
              </div>
              <div><div style={labelStyle}>Body</div>
                <textarea value={body} onChange={e => setBody(e.target.value)} rows={10}
                  style={{ ...inputStyle, lineHeight: 1.7, resize: 'vertical', fontFamily: body_font }} />
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        {(stage === 'preview' || stage === 'editing' || stage === 'sending') && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e8e5df', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: '0.5rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => setStage('idle')}
                style={{ fontFamily: mono, fontSize: '0.7rem', letterSpacing: '0.06em', padding: '0.3rem 0.6rem', borderRadius: '4px', border: '1px solid #ddd', background: 'transparent', color: '#888', cursor: 'pointer' }}>
                ← Templates
              </button>
              {(stage === 'preview' || stage === 'editing') && (
                <>
                  <button onClick={saveDraft} disabled={draftSaving}
                    style={{ fontFamily: mono, fontSize: '0.7rem', letterSpacing: '0.06em', padding: '0.3rem 0.6rem', borderRadius: '4px', border: `1px solid ${draftSaved ? '#34d399' : '#ccc'}`, background: 'transparent', color: draftSaved ? '#34d399' : '#888', cursor: 'pointer' }}>
                    {draftSaving ? 'Saving…' : draftSaved ? '✓ Saved' : 'Save Draft'}
                  </button>
                  <button onClick={saveAsTemplate} disabled={savingTemplate}
                    style={{ fontFamily: mono, fontSize: '0.7rem', letterSpacing: '0.06em', padding: '0.3rem 0.6rem', borderRadius: '4px', border: '1px solid #ccc', background: 'transparent', color: templateSaved ? '#34d399' : '#888', cursor: 'pointer' }}>
                    {savingTemplate ? 'Saving…' : templateSaved ? '✓ Template Saved' : 'Save as Template'}
                  </button>
                </>
              )}
              {error && stage === 'preview' && <span style={{ color: '#ef4444', fontSize: '0.78rem', fontFamily: body_font }}>{error}</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.4rem' }}>
              {stage === 'preview' && (
                <>
                  <button onClick={() => setStage('editing')}
                    style={{ fontFamily: mono, fontSize: '0.78rem', letterSpacing: '0.06em', padding: '0.45rem 1rem', borderRadius: '4px', border: '1px solid #ccc', background: 'transparent', color: '#555', cursor: 'pointer' }}>
                    Edit
                  </button>
                  <button onClick={send}
                    style={{ fontFamily: mono, fontSize: '0.78rem', letterSpacing: '0.06em', padding: '0.45rem 1.25rem', borderRadius: '4px', border: 'none', background: '#1a1a2e', color: '#f5f3ee', cursor: 'pointer' }}>
                    Approve &amp; Send
                  </button>
                </>
              )}
              {stage === 'editing' && (
                <>
                  <button onClick={() => setStage('preview')}
                    style={{ fontFamily: mono, fontSize: '0.78rem', letterSpacing: '0.06em', padding: '0.45rem 1rem', borderRadius: '4px', border: '1px solid #ccc', background: 'transparent', color: '#555', cursor: 'pointer' }}>
                    Preview
                  </button>
                  <button onClick={() => setStage('preview')}
                    style={{ fontFamily: mono, fontSize: '0.78rem', letterSpacing: '0.06em', padding: '0.45rem 1.25rem', borderRadius: '4px', border: 'none', background: '#1a1a2e', color: '#f5f3ee', cursor: 'pointer' }}>
                    Done Editing
                  </button>
                </>
              )}
              {stage === 'sending' && (
                <button disabled style={{ fontFamily: mono, fontSize: '0.78rem', letterSpacing: '0.06em', padding: '0.45rem 1.25rem', borderRadius: '4px', border: 'none', background: '#888', color: '#fff', cursor: 'not-allowed' }}>
                  Sending…
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
