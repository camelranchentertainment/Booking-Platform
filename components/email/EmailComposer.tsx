import { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';

// ── Constants ──────────────────────────────────────────────────────────────
const CATEGORY_LABELS: Record<string, string> = {
  target:       'Cold Pitch',
  follow_up_1:  'Follow Up 1',
  follow_up_2:  'Follow Up 2',
  confirmation: 'Confirmation',
  decline:      'Decline',
  advance:      'Advance',
  thank_you:    'Thank You',
};

const CATEGORY_ORDER = ['target', 'follow_up_1', 'follow_up_2', 'confirmation', 'advance', 'thank_you', 'decline'];

const CATEGORY_COLORS: Record<string, string> = {
  target:       '#60a5fa',
  follow_up_1:  '#fbbf24',
  follow_up_2:  '#f97316',
  confirmation: '#34d399',
  decline:      '#94a3b8',
  advance:      '#f97316',
  thank_you:    '#a78bfa',
};

type Stage = 'ready' | 'generating' | 'sending' | 'sent';

interface Props {
  bookingId?:      string;
  tourVenueId?:    string;
  tourId?:         string;
  actId:           string;
  venueId?:        string;
  contactId?:      string;
  contactEmail?:   string;
  defaultCategory: string;
  agentName?:      string;
  initialSubject?: string;
  initialBody?:    string;
  draftId?:        string;
  onClose: (didSend?: boolean) => void;
}

type TemplateMap = Record<string, { subject: string; body: string }>;

export default function EmailComposer({
  bookingId, tourVenueId, actId, venueId, contactId, contactEmail,
  defaultCategory, agentName, initialSubject, initialBody, draftId, onClose,
}: Props) {
  const [stage, setStage]         = useState<Stage>('ready');
  const [category, setCategory]   = useState(defaultCategory);
  const [subject, setSubject]     = useState(initialSubject || '');
  const [body, setBody]           = useState(initialBody || '');
  const [to, setTo]               = useState(contactEmail || '');
  const [error, setError]         = useState('');

  const [templates, setTemplates]           = useState<TemplateMap>({});
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved]   = useState(false);

  const [draftSaving, setDraftSaving]       = useState(false);
  const [draftSaved, setDraftSaved]         = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState(draftId || '');

  useEffect(() => {
    loadTemplates();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const getAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : '';
  };

  const loadTemplates = async () => {
    const auth = await getAuth();
    const res = await fetch(`/api/email/templates?actId=${actId}`, {
      headers: { Authorization: auth },
    });
    const data = await res.json();
    if (Array.isArray(data.templates)) {
      const map: TemplateMap = {};
      for (const t of data.templates) {
        map[t.category] = { subject: t.subject || '', body: t.body || '' };
      }
      setTemplates(map);
      // Auto-load default category's template if no initial content supplied
      if (!initialSubject && !initialBody && map[defaultCategory]) {
        setSubject(map[defaultCategory].subject);
        setBody(map[defaultCategory].body);
      }
    }
  };

  const handleCategoryClick = (c: string) => {
    setCategory(c);
    setError('');
    // Auto-populate when a saved template exists for this category
    if (templates[c]) {
      setSubject(templates[c].subject);
      setBody(templates[c].body);
    }
  };

  const loadTemplate = () => {
    if (!templates[category]) return;
    setSubject(templates[category].subject);
    setBody(templates[category].body);
    setError('');
  };

  const generateWithAI = async () => {
    setStage('generating');
    setError('');
    const auth = await getAuth();
    const res = await fetch('/api/email/ai-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        category, bookingId, actId, venueId, contactId,
        agentName, agencyName: 'Camel Ranch Booking',
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'AI generation failed — check API key in Settings');
      setStage('ready');
      return;
    }
    setSubject(data.draft?.subject || '');
    setBody(data.draft?.body || '');
    setStage('ready');
  };

  const saveDraft = async () => {
    setDraftSaving(true);
    const auth = await getAuth();
    const res = await fetch('/api/email/save-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        draftId: currentDraftId || undefined,
        actId, venueId, tourVenueId, bookingId, contactId,
        recipient: to || null, subject, body, category,
      }),
    });
    const data = await res.json();
    if (data.id) setCurrentDraftId(data.id);
    setDraftSaving(false);
    setDraftSaved(true);
    setTimeout(() => setDraftSaved(false), 2500);
  };

  const saveAsTemplate = async () => {
    const name = window.prompt('Save template as:');
    if (!name?.trim()) return;
    setSavingTemplate(true);
    const auth = await getAuth();
    await fetch('/api/email/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ actId, category, subject, body }),
    });
    setTemplates(prev => ({ ...prev, [category]: { subject, body } }));
    setSavingTemplate(false);
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 2500);
  };

  const send = async () => {
    if (!to.trim()) { setError('Recipient email required'); return; }
    setStage('sending');
    setError('');
    const auth = await getAuth();
    const html = body.replace(/\n/g, '<br>');
    const res = await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({
        to, subject, html,
        bookingId:   bookingId   || null,
        tourVenueId: tourVenueId || null,
        venueId:     venueId     || null,
        contactId:   contactId   || null,
        actId,
        category,
        bodyPreview: body,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Send failed');
      setStage('ready');
      return;
    }
    // Clean up the draft row if this came from a saved draft
    if (currentDraftId) {
      await supabase.from('email_log').delete().eq('id', currentDraftId).eq('is_draft', true);
    }
    setStage('sent');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#fff', border: '1px solid #ddd', borderRadius: '4px',
    padding: '0.45rem 0.65rem', fontSize: '0.88rem', color: '#1a1a2e',
    fontFamily: 'var(--font-body)', boxSizing: 'border-box',
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: '0.67rem', textTransform: 'uppercase',
    letterSpacing: '0.1em', color: '#888', marginBottom: '0.25rem', display: 'block',
  };
  const btnBase: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: '0.74rem', letterSpacing: '0.06em',
    padding: '0.4rem 0.9rem', borderRadius: '4px', cursor: 'pointer', border: '1px solid #ccc',
    background: 'transparent', color: '#555', transition: 'opacity 0.15s',
  };
  const btnPrimary: React.CSSProperties = {
    ...btnBase, background: '#1a1a2e', border: 'none', color: '#f5f3ee',
  };
  const btnOff: React.CSSProperties = { ...btnBase, opacity: 0.45, cursor: 'not-allowed' };

  const isWorking = stage === 'generating' || stage === 'sending';

  const catColor = CATEGORY_COLORS[category] || '#888';

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: '#f5f3ee', borderRadius: 'var(--radius)', width: '100%', maxWidth: 600, position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '1.1rem 1.5rem 0.85rem', borderBottom: '1px solid #e8e5df', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
            <span style={{ fontFamily: 'var(--font-display)', fontSize: '1.05rem', color: '#1a1a2e', letterSpacing: '0.05em' }}>Compose Email</span>
            <button onClick={() => onClose()} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, padding: '0.1rem 0.3rem' }}>✕</button>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
            {CATEGORY_ORDER.map(c => {
              const active = category === c;
              const hasTmpl = !!templates[c];
              return (
                <button
                  key={c}
                  onClick={() => handleCategoryClick(c)}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: '0.64rem', letterSpacing: '0.08em',
                    textTransform: 'uppercase', padding: '0.18rem 0.55rem', borderRadius: '3px', cursor: 'pointer',
                    border: `1px solid ${active ? CATEGORY_COLORS[c] : '#ddd'}`,
                    background: active ? `${CATEGORY_COLORS[c]}18` : 'transparent',
                    color: active ? CATEGORY_COLORS[c] : '#aaa',
                    display: 'flex', alignItems: 'center', gap: '0.3rem',
                  }}
                >
                  {CATEGORY_LABELS[c]}
                  {hasTmpl && (
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? CATEGORY_COLORS[c] : '#bbb', display: 'inline-block', flexShrink: 0 }} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Sent confirmation */}
        {stage === 'sent' && (
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✓</div>
            <div style={{ color: '#1a1a2e', fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Email Sent</div>
            <div style={{ color: '#888', fontFamily: 'var(--font-body)', fontSize: '0.84rem', marginBottom: '1.5rem' }}>to {to}</div>
            <button style={btnPrimary} onClick={() => onClose(true)}>Done</button>
          </div>
        )}

        {/* Compose fields — always editable */}
        {stage !== 'sent' && (
          <div style={{ padding: '1rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
            <div>
              <label style={labelStyle}>To</label>
              <input
                value={to}
                onChange={e => setTo(e.target.value)}
                placeholder="recipient@venue.com"
                style={inputStyle}
              />
            </div>

            <div>
              <label style={labelStyle}>Subject</label>
              <input
                value={subject}
                onChange={e => setSubject(e.target.value)}
                placeholder="Email subject line..."
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>Body</label>
              <textarea
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder={
                  templates[category]
                    ? 'Click "Load Template" to restore your saved template, or type here directly.'
                    : 'Type your email here, or click "Generate with AI" to draft one.'
                }
                style={{
                  ...inputStyle,
                  minHeight: 300, resize: 'vertical', lineHeight: 1.7,
                  fontFamily: 'var(--font-body)',
                }}
              />
            </div>

            {/* Status / error */}
            {stage === 'generating' && (
              <div style={{ color: '#888', fontFamily: 'var(--font-body)', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS[category] }} />
                Generating with AI...
              </div>
            )}
            {error && (
              <div style={{ color: '#ef4444', fontFamily: 'var(--font-body)', fontSize: '0.82rem' }}>{error}</div>
            )}
          </div>
        )}

        {/* Footer action bar */}
        {stage !== 'sent' && (
          <div style={{ padding: '0.85rem 1.5rem', borderTop: '1px solid #e8e5df', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: '0.5rem', flexWrap: 'wrap' }}>
            {/* Left: template management */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                onClick={loadTemplate}
                disabled={!templates[category] || isWorking}
                title={templates[category] ? `Load saved ${CATEGORY_LABELS[category]} template` : `No saved template for ${CATEGORY_LABELS[category]}`}
                style={!templates[category] || isWorking ? btnOff : btnBase}
              >
                Load Template
              </button>
              <button
                onClick={saveAsTemplate}
                disabled={savingTemplate || isWorking}
                style={savingTemplate || isWorking ? btnOff : btnBase}
              >
                {templateSaved ? '✓ Template Saved' : savingTemplate ? 'Saving…' : 'Save as Template'}
              </button>
            </div>

            {/* Right: compose actions */}
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button
                onClick={generateWithAI}
                disabled={isWorking}
                style={isWorking ? btnOff : btnBase}
              >
                {stage === 'generating' ? 'Generating…' : 'Generate with AI'}
              </button>
              <button
                onClick={saveDraft}
                disabled={draftSaving || isWorking}
                style={draftSaving || isWorking ? btnOff : btnBase}
              >
                {draftSaved ? '✓ Draft Saved' : draftSaving ? 'Saving…' : 'Save Draft'}
              </button>
              <button
                onClick={send}
                disabled={isWorking}
                style={isWorking ? { ...btnPrimary, opacity: 0.45, cursor: 'not-allowed' } : btnPrimary}
              >
                {stage === 'sending' ? 'Sending…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
