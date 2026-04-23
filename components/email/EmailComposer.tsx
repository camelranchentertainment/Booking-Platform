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

const CATEGORY_COLORS: Record<string, string> = {
  target:       '#60a5fa',
  follow_up_1:  '#fbbf24',
  follow_up_2:  '#f97316',
  confirmation: '#34d399',
  decline:      '#94a3b8',
  advance:      '#f97316',
  thank_you:    '#a78bfa',
};

type Stage = 'loading' | 'preview' | 'editing' | 'sending' | 'sent' | 'error';

interface Props {
  bookingId?: string;
  actId: string;
  venueId?: string;
  contactId?: string;
  contactEmail?: string;
  defaultCategory: string;
  agentName?: string;
  initialSubject?: string;
  initialBody?: string;
  draftId?: string;
  onClose: () => void;
}

export default function EmailComposer({ bookingId, actId, venueId, contactId, contactEmail, defaultCategory, agentName, initialSubject, initialBody, draftId, onClose }: Props) {
  const [stage, setStage]       = useState<Stage>('loading');
  const [category, setCategory] = useState(defaultCategory);
  const [subject, setSubject]   = useState('');
  const [body, setBody]         = useState('');
  const [to, setTo]             = useState(contactEmail || '');
  const [error, setError]       = useState('');
  const [hasTemplate, setHasTemplate] = useState(false);
  const [usingTemplate, setUsingTemplate] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [templateSaved, setTemplateSaved] = useState(false);

  useEffect(() => { loadDraft(); }, [category]);

  const loadDraft = async () => {
    setStage('loading');
    setError('');
    setTemplateSaved(false);

    // If pre-filled content provided (from auto-draft), skip AI generation
    if (initialSubject || initialBody) {
      setSubject(initialSubject || '');
      setBody(initialBody || '');
      setStage('preview');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    const auth = session?.access_token ? `Bearer ${session.access_token}` : '';

    // Check for saved template
    const tmplRes = await fetch(`/api/email/templates?actId=${actId}&category=${category}`, {
      headers: { Authorization: auth },
    });
    const tmplData = await tmplRes.json();
    const template = tmplData.template;
    setHasTemplate(!!template);

    if (template && usingTemplate) {
      setSubject(template.subject || '');
      setBody(template.body);
      setStage('preview');
      return;
    }

    // AI draft
    const draftRes = await fetch('/api/email/ai-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify({ category, bookingId, actId, venueId, contactId, agentName, agencyName: 'Camel Ranch Booking' }),
    });
    const draftData = await draftRes.json();
    if (!draftRes.ok) { setError(draftData.error || 'Failed to generate draft'); setStage('error'); return; }

    setSubject(draftData.draft.subject || '');
    setBody(draftData.draft.body || '');
    setStage('preview');
  };

  const switchSource = async (useTemplate: boolean) => {
    setUsingTemplate(useTemplate);
    if (useTemplate) {
      const { data: { session } } = await supabase.auth.getSession();
      const auth = `Bearer ${session?.access_token}`;
      const res = await fetch(`/api/email/templates?actId=${actId}&category=${category}`, { headers: { Authorization: auth } });
      const data = await res.json();
      if (data.template) { setSubject(data.template.subject || ''); setBody(data.template.body); }
    } else {
      loadDraft();
    }
  };

  const saveAsTemplate = async () => {
    setSavingTemplate(true);
    const { data: { session } } = await supabase.auth.getSession();
    await fetch('/api/email/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body: JSON.stringify({ actId, category, subject, body }),
    });
    setHasTemplate(true);
    setSavingTemplate(false);
    setTemplateSaved(true);
    setTimeout(() => setTemplateSaved(false), 3000);
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
        bookingId: bookingId || null,
        venueId:   venueId   || null,
        contactId: contactId || null,
        actId,
        category,
        bodyPreview: body,
      }),
    });
    const data = await res.json();
    if (!res.ok) { setError(data.error || 'Send failed'); setStage('preview'); return; }

    // Delete auto-draft if this was a review of a saved draft
    if (draftId) {
      await supabase.from('email_drafts').delete().eq('id', draftId);
    }

    setStage('sent');
  };

  const modalStyle: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
  };
  const cardStyle: React.CSSProperties = {
    background: '#f5f3ee', borderRadius: 'var(--radius)', width: '100%', maxWidth: 580,
    position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', maxHeight: '90vh',
    display: 'flex', flexDirection: 'column',
  };

  return (
    <div style={modalStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={cardStyle}>
        {/* Header */}
        <div style={{ padding: '1.25rem 1.5rem 1rem', borderBottom: '1px solid #e8e5df', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span style={{
                background: `${CATEGORY_COLORS[category]}22`, color: CATEGORY_COLORS[category],
                fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.1em',
                textTransform: 'uppercase', padding: '0.2rem 0.6rem', borderRadius: '3px',
              }}>
                {CATEGORY_LABELS[category] || category}
              </span>
              {hasTemplate && (
                <div style={{ display: 'flex', gap: '0.25rem' }}>
                  <button
                    onClick={() => switchSource(false)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.06em', padding: '0.15rem 0.5rem', borderRadius: '3px', border: `1px solid ${!usingTemplate ? '#1a1a2e' : '#ccc'}`, background: !usingTemplate ? '#1a1a2e' : 'transparent', color: !usingTemplate ? '#f5f3ee' : '#888', cursor: 'pointer' }}>
                    AI Draft
                  </button>
                  <button
                    onClick={() => switchSource(true)}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', letterSpacing: '0.06em', padding: '0.15rem 0.5rem', borderRadius: '3px', border: `1px solid ${usingTemplate ? '#1a1a2e' : '#ccc'}`, background: usingTemplate ? '#1a1a2e' : 'transparent', color: usingTemplate ? '#f5f3ee' : '#888', cursor: 'pointer' }}>
                    My Template
                  </button>
                </div>
              )}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#888', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1 }}>✕</button>
          </div>

          {/* Category selector */}
          <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
            {Object.keys(CATEGORY_LABELS).map(c => (
              <button key={c} onClick={() => { setCategory(c); setUsingTemplate(false); }}
                style={{ fontFamily: 'var(--font-mono)', fontSize: '0.65rem', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '0.15rem 0.5rem', borderRadius: '3px', border: `1px solid ${category === c ? CATEGORY_COLORS[c] : '#ddd'}`, background: category === c ? `${CATEGORY_COLORS[c]}18` : 'transparent', color: category === c ? CATEGORY_COLORS[c] : '#aaa', cursor: 'pointer' }}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '1.25rem 1.5rem', overflowY: 'auto', flex: 1 }}>
          {stage === 'loading' && (
            <div style={{ textAlign: 'center', padding: '2rem', color: '#888', fontFamily: 'var(--font-body)', fontSize: '0.84rem' }}>
              Drafting email...
            </div>
          )}

          {stage === 'error' && (
            <div style={{ color: '#ef4444', fontFamily: 'var(--font-body)', fontSize: '0.84rem', padding: '1rem' }}>{error}</div>
          )}

          {stage === 'sent' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>✓</div>
              <div style={{ color: '#1a1a2e', fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Email Sent</div>
              <div style={{ color: '#888', fontFamily: 'var(--font-body)', fontSize: '0.84rem', marginBottom: '1.5rem' }}>to {to}</div>
              <button className="btn btn-primary" onClick={onClose} style={{ background: '#1a1a2e', borderColor: '#1a1a2e', color: '#f5f3ee' }}>Done</button>
            </div>
          )}

          {(stage === 'preview' || stage === 'sending') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: '0.25rem' }}>To</div>
                <input
                  value={to} onChange={e => setTo(e.target.value)}
                  placeholder="venue@example.com"
                  style={{ width: '100%', background: '#fff', border: '1px solid #ddd', borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '0.88rem', color: '#1a1a2e', fontFamily: 'var(--font-body)' }}
                />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: '0.25rem' }}>Subject</div>
                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '0.88rem', color: '#1a1a2e', fontFamily: 'var(--font-body)' }}>{subject || '—'}</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: '0.25rem' }}>Body</div>
                <div style={{ background: '#fff', border: '1px solid #ddd', borderRadius: '4px', padding: '0.75rem', fontSize: '0.86rem', color: '#1a1a2e', fontFamily: 'var(--font-body)', lineHeight: 1.7, whiteSpace: 'pre-wrap', minHeight: 120 }}>{body}</div>
              </div>
            </div>
          )}

          {stage === 'editing' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: '0.25rem' }}>To</div>
                <input value={to} onChange={e => setTo(e.target.value)} style={{ width: '100%', background: '#fff', border: '1px solid #ddd', borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '0.88rem', color: '#1a1a2e' }} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: '0.25rem' }}>Subject</div>
                <input value={subject} onChange={e => setSubject(e.target.value)} style={{ width: '100%', background: '#fff', border: '1px solid #ddd', borderRadius: '4px', padding: '0.4rem 0.6rem', fontSize: '0.88rem', color: '#1a1a2e' }} />
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#888', marginBottom: '0.25rem' }}>Body</div>
                <textarea
                  value={body} onChange={e => setBody(e.target.value)} rows={10}
                  style={{ width: '100%', background: '#fff', border: '1px solid #ddd', borderRadius: '4px', padding: '0.6rem 0.75rem', fontSize: '0.86rem', color: '#1a1a2e', fontFamily: 'var(--font-body)', lineHeight: 1.7, resize: 'vertical' }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        {(stage === 'preview' || stage === 'editing' || stage === 'sending') && (
          <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid #e8e5df', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: '0.75rem' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {(stage === 'preview' || stage === 'editing') && (
                <button
                  onClick={saveAsTemplate}
                  disabled={savingTemplate}
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.72rem', letterSpacing: '0.06em', padding: '0.35rem 0.75rem', borderRadius: '4px', border: '1px solid #ccc', background: 'transparent', color: '#888', cursor: 'pointer' }}>
                  {savingTemplate ? 'Saving…' : templateSaved ? '✓ Saved' : 'Save as Template'}
                </button>
              )}
              {error && stage === 'preview' && <span style={{ color: '#ef4444', fontSize: '0.78rem', fontFamily: 'var(--font-body)' }}>{error}</span>}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              {stage === 'preview' && (
                <>
                  <button onClick={() => setStage('editing')}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.06em', padding: '0.45rem 1rem', borderRadius: '4px', border: '1px solid #ccc', background: 'transparent', color: '#555', cursor: 'pointer' }}>
                    Edit
                  </button>
                  <button onClick={send}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.06em', padding: '0.45rem 1.25rem', borderRadius: '4px', border: 'none', background: '#1a1a2e', color: '#f5f3ee', cursor: 'pointer' }}>
                    Approve & Send
                  </button>
                </>
              )}
              {stage === 'editing' && (
                <>
                  <button onClick={() => setStage('preview')}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.06em', padding: '0.45rem 1rem', borderRadius: '4px', border: '1px solid #ccc', background: 'transparent', color: '#555', cursor: 'pointer' }}>
                    Preview
                  </button>
                  <button onClick={() => setStage('preview')}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.06em', padding: '0.45rem 1.25rem', borderRadius: '4px', border: 'none', background: '#1a1a2e', color: '#f5f3ee', cursor: 'pointer' }}>
                    Done Editing
                  </button>
                </>
              )}
              {stage === 'sending' && (
                <button disabled style={{ fontFamily: 'var(--font-mono)', fontSize: '0.78rem', letterSpacing: '0.06em', padding: '0.45rem 1.25rem', borderRadius: '4px', border: 'none', background: '#888', color: '#fff', cursor: 'not-allowed' }}>
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
