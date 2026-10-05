// components/email/EmailComposer.tsx
//
// Compose / send one email.
//  • Templates: pick any saved template by its title, or save the current
//    email as a template under a title you choose. No template "types".
//  • Attachments: band files (riders, stage plot, photos…) or files from your
//    computer. Computer files upload to the band's private storage first; the
//    server attaches them at send time.
//  • Drafts keep their attachments.

import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  EMAIL_UPLOAD_FOLDER,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_TOTAL_ATTACHMENT_BYTES,
  formatBytes,
  safeStorageName,
  type AttachmentRef,
} from '../../lib/emailAttachments';

type Stage = 'ready' | 'generating' | 'sending' | 'sent';

interface Props {
  bookingId?:      string;
  tourVenueId?:    string;
  tourId?:         string;
  actId:           string;
  venueId?:        string;
  contactId?:      string;
  contactEmail?:   string;
  /** Used only for "Generate with AI" context and email history. Not shown. */
  defaultCategory: string;
  agentName?:      string;
  initialSubject?: string;
  initialBody?:    string;
  initialAttachments?: AttachmentRef[];
  draftId?:        string;
  onClose: (didSend?: boolean) => void;
}

interface Template { id: string; name: string; subject: string; body: string }

interface BandFile {
  id: string;
  file_name: string;
  mime_type: string | null;
  size: number | null;
  document_category: string | null;
}

const DOC_LABELS: Record<string, string> = {
  stage_plot_input_list: 'Stage plot / input list',
  technical_rider:       'Technical rider',
  hospitality_rider:     'Hospitality rider',
  contact_sheet:         'Contact sheet',
  w9:                    'W-9',
  coi:                   'Certificate of insurance',
  bio:                   'Bio / one-sheet',
};

function bandFileLabel(f: BandFile): string {
  const kind = f.document_category ? DOC_LABELS[f.document_category] : null;
  return kind ? `${kind} — ${f.file_name}` : f.file_name;
}

export default function EmailComposer({
  bookingId, tourVenueId, actId, venueId, contactId, contactEmail,
  defaultCategory, agentName, initialSubject, initialBody, initialAttachments, draftId, onClose,
}: Props) {
  const category = defaultCategory;
  const [stage, setStage]     = useState<Stage>('ready');
  const [subject, setSubject] = useState(initialSubject || '');
  const [body, setBody]       = useState(initialBody || '');
  const [to, setTo]           = useState(contactEmail || '');
  const [error, setError]     = useState('');
  const [notice, setNotice]   = useState('');

  // Templates
  const [templates, setTemplates]       = useState<Template[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(true);
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [saveOpen, setSaveOpen]         = useState(false);
  const [templateTitle, setTemplateTitle] = useState('');
  const [titleTaken, setTitleTaken]     = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Attachments
  const [attachments, setAttachments] = useState<AttachmentRef[]>(initialAttachments ?? []);
  const [uploading, setUploading]     = useState(0);
  const [bandFiles, setBandFiles]     = useState<BandFile[] | null>(null);
  const [bandFilesOpen, setBandFilesOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Drafts
  const [draftSaving, setDraftSaving]       = useState(false);
  const [currentDraftId, setCurrentDraftId] = useState(draftId || '');

  const isWorking = stage === 'generating' || stage === 'sending' || uploading > 0;
  const totalBytes = useMemo(() => attachments.reduce((n, a) => n + (a.size || 0), 0), [attachments]);

  const flash = (msg: string) => {
    setNotice(msg);
    window.setTimeout(() => setNotice(n => (n === msg ? '' : n)), 2500);
  };

  const getAuth = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ? `Bearer ${session.access_token}` : '';
  };

  /** fetch + JSON with a readable error message on failure. */
  const api = async <T,>(url: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: T & { error?: string; code?: string } }> => {
    const auth = await getAuth();
    const res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: auth, ...(init.headers || {}) },
    });
    let data: any = {};
    try { data = await res.json(); } catch { /* empty body */ }
    return { ok: res.ok, status: res.status, data };
  };

  // ── Templates ────────────────────────────────────────────────────────────
  const loadTemplates = async () => {
    setTemplatesLoading(true);
    const { ok, data } = await api<{ templates: Template[] }>('/api/email/templates');
    setTemplatesLoading(false);
    if (ok && Array.isArray(data.templates)) setTemplates(data.templates);
    else setError(data.error || 'Could not load your templates.');
  };

  useEffect(() => {
    const t = window.setTimeout(() => { void loadTemplates(); }, 0);
    return () => window.clearTimeout(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const applyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (!t) return;
    const hasWork = (subject.trim() || body.trim()) && (subject !== t.subject || body !== t.body);
    if (hasWork && !window.confirm(`Replace what you've written with the "${t.name}" template?`)) {
      setSelectedTemplateId('');
      return;
    }
    setSubject(t.subject || '');
    setBody(t.body || '');
    setError('');
  };

  const deleteTemplate = async () => {
    const t = templates.find(x => x.id === selectedTemplateId);
    if (!t || !window.confirm(`Delete the template "${t.name}"? Emails already sent aren't affected.`)) return;
    const { ok, data } = await api('/api/email/templates', { method: 'DELETE', body: JSON.stringify({ id: t.id }) });
    if (!ok) { setError(data.error || 'Could not delete the template.'); return; }
    setTemplates(prev => prev.filter(x => x.id !== t.id));
    setSelectedTemplateId('');
    flash(`Deleted "${t.name}"`);
  };

  const openSaveTemplate = () => {
    const current = templates.find(x => x.id === selectedTemplateId);
    setTemplateTitle(current?.name || subject.slice(0, 80));
    setTitleTaken(false);
    setSaveOpen(true);
    setError('');
  };

  const saveTemplate = async (overwrite = false) => {
    const name = templateTitle.trim();
    if (!name) { setError('Give the template a title.'); return; }
    if (!body.trim()) { setError('Write the email before saving it as a template.'); return; }
    setSavingTemplate(true);
    const { ok, status, data } = await api<{ template: Template }>('/api/email/templates', {
      method: 'POST',
      body: JSON.stringify({ name, subject, body, overwrite }),
    });
    setSavingTemplate(false);
    if (status === 409 && data.code === 'EXISTS') { setTitleTaken(true); return; }
    if (!ok || !data.template) { setError(data.error || 'Could not save the template.'); return; }
    const saved = data.template;
    setTemplates(prev => [...prev.filter(x => x.id !== saved.id), saved].sort((a, b) => a.name.localeCompare(b.name)));
    setSelectedTemplateId(saved.id);
    setSaveOpen(false);
    setTitleTaken(false);
    flash(`Saved template "${saved.name}"`);
  };

  // ── Attachments ──────────────────────────────────────────────────────────
  const canAdd = (size: number, name: string): string | null => {
    if (attachments.length >= MAX_ATTACHMENTS) return `You can attach up to ${MAX_ATTACHMENTS} files.`;
    if (size > MAX_ATTACHMENT_BYTES) return `"${name}" is larger than 10 MB.`;
    if (totalBytes + size > MAX_TOTAL_ATTACHMENT_BYTES) return 'Attachments would add up to more than 15 MB.';
    return null;
  };

  const onPickComputerFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError('');
    for (const file of Array.from(files)) {
      const problem = canAdd(file.size, file.name);
      if (problem) { setError(problem); break; }
      const path = `${actId}/${EMAIL_UPLOAD_FOLDER}/${crypto.randomUUID()}-${safeStorageName(file.name)}`;
      setUploading(n => n + 1);
      const { error: upErr } = await supabase.storage
        .from('band-documents')
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      setUploading(n => n - 1);
      if (upErr) { setError(`Couldn't upload "${file.name}". Try again.`); continue; }
      setAttachments(prev => [...prev, { source: 'upload', path, name: file.name, size: file.size, mime: file.type || undefined }]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const toggleBandFiles = async () => {
    const next = !bandFilesOpen;
    setBandFilesOpen(next);
    if (next && bandFiles === null) {
      const { data, error: qErr } = await supabase
        .from('media_library')
        .select('id, file_name, mime_type, file_size_bytes, file_size, document_category')
        .eq('act_id', actId)
        .order('document_category', { ascending: true, nullsFirst: false })
        .order('file_name', { ascending: true });
      if (qErr) { setError('Could not load your band files.'); setBandFiles([]); return; }
      setBandFiles((data || []).map((r: any) => ({
        id: r.id, file_name: r.file_name, mime_type: r.mime_type,
        size: r.file_size_bytes ?? r.file_size ?? null, document_category: r.document_category,
      })));
    }
  };

  const toggleBandFile = (f: BandFile) => {
    const already = attachments.some(a => a.source === 'library' && a.id === f.id);
    if (already) {
      setAttachments(prev => prev.filter(a => !(a.source === 'library' && a.id === f.id)));
      return;
    }
    const problem = canAdd(f.size || 0, f.file_name);
    if (problem) { setError(problem); return; }
    setError('');
    setAttachments(prev => [...prev, { source: 'library', id: f.id, name: f.file_name, size: f.size ?? undefined, mime: f.mime_type ?? undefined }]);
  };

  const removeAttachment = (i: number) => setAttachments(prev => prev.filter((_, idx) => idx !== i));

  // ── AI / drafts / send ───────────────────────────────────────────────────
  const generateWithAI = async () => {
    setStage('generating');
    setError('');
    const { ok, data } = await api<{ draft?: { subject?: string; body?: string } }>('/api/email/ai-draft', {
      method: 'POST',
      body: JSON.stringify({ category, bookingId, actId, venueId, contactId, agentName, agencyName: 'Camel Ranch Booking' }),
    });
    setStage('ready');
    if (!ok) { setError(data.error || 'AI draft failed. Check the AI key in Settings.'); return; }
    setSubject(data.draft?.subject || '');
    setBody(data.draft?.body || '');
  };

  const saveDraft = async () => {
    setDraftSaving(true);
    setError('');
    const { ok, data } = await api<{ id?: string }>('/api/email/save-draft', {
      method: 'POST',
      body: JSON.stringify({
        draftId: currentDraftId || undefined,
        actId, venueId, tourVenueId, bookingId, contactId,
        recipient: to || null, subject, body, category, attachments,
      }),
    });
    setDraftSaving(false);
    if (!ok || !data.id) { setError(data.error || 'Could not save the draft.'); return; }
    setCurrentDraftId(data.id);
    flash('Draft saved');
  };

  const send = async () => {
    if (!to.trim()) { setError('Add the recipient\'s email address.'); return; }
    if (!subject.trim()) { setError('Add a subject.'); return; }
    if (!body.trim()) { setError('The email is empty.'); return; }
    setStage('sending');
    setError('');
    const html = body.replace(/\n/g, '<br>');
    const { ok, data } = await api('/api/email/send', {
      method: 'POST',
      body: JSON.stringify({
        to, subject, html,
        bookingId: bookingId || null, tourVenueId: tourVenueId || null,
        venueId: venueId || null, contactId: contactId || null,
        actId, category, bodyPreview: body, attachments,
      }),
    });
    if (!ok) { setError(data.error || 'Send failed.'); setStage('ready'); return; }
    if (currentDraftId) {
      await supabase.from('email_log').delete().eq('id', currentDraftId).eq('is_draft', true);
    }
    setStage('sent');
  };

  // ── Styles ───────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', background: '#fff', border: '1px solid #ddd', borderRadius: '4px',
    padding: '0.5rem 0.65rem', fontSize: '0.88rem', color: '#1a1a2e',
    fontFamily: 'var(--font-body)', boxSizing: 'border-box', minHeight: 40,
  };
  const labelStyle: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: '0.67rem', textTransform: 'uppercase',
    letterSpacing: '0.1em', color: '#666', marginBottom: '0.25rem', display: 'block',
  };
  const btnBase: React.CSSProperties = {
    fontFamily: 'var(--font-mono)', fontSize: '0.74rem', letterSpacing: '0.06em',
    padding: '0.5rem 0.9rem', minHeight: 40, borderRadius: '4px', cursor: 'pointer', border: '1px solid #bbb',
    background: 'transparent', color: '#333', transition: 'opacity 0.15s',
  };
  const btnPrimary: React.CSSProperties = { ...btnBase, background: '#1a1a2e', border: 'none', color: '#f5f3ee' };
  const btnOff = (b: React.CSSProperties): React.CSSProperties => ({ ...b, opacity: 0.45, cursor: 'not-allowed' });
  const linkBtn: React.CSSProperties = {
    background: 'none', border: 'none', padding: '0.25rem 0.1rem', cursor: 'pointer',
    color: '#b45309', fontFamily: 'var(--font-body)', fontSize: '0.8rem', textDecoration: 'underline',
  };

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}
      onClick={e => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="composer-title"
        style={{ background: '#f5f3ee', borderRadius: 'var(--radius)', width: '100%', maxWidth: 640, position: 'relative', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', maxHeight: '95vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Header */}
        <div style={{ padding: '1.1rem 1.5rem 0.85rem', borderBottom: '1px solid #e8e5df', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem' }}>
            <h2 id="composer-title" style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: '1.15rem', color: '#1a1a2e', letterSpacing: '0.05em', fontWeight: 400 }}>Compose Email</h2>
            <button onClick={() => onClose()} aria-label="Close" style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, minWidth: 40, minHeight: 40 }}>✕</button>
          </div>

          {stage !== 'sent' && (
            <div style={{ marginTop: '0.75rem' }}>
              <label htmlFor="composer-template" style={labelStyle}>Start from a template</label>
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                <select
                  id="composer-template"
                  value={selectedTemplateId}
                  onChange={e => applyTemplate(e.target.value)}
                  disabled={templatesLoading || isWorking}
                  style={{ ...inputStyle, flex: '1 1 260px', width: 'auto', cursor: 'pointer' }}
                >
                  <option value="">
                    {templatesLoading ? 'Loading templates…' : templates.length ? '— Choose a template —' : 'No templates yet — write one and click "Save as template"'}
                  </option>
                  {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                {selectedTemplate && (
                  <button type="button" onClick={deleteTemplate} style={linkBtn} disabled={isWorking}>
                    Delete this template
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sent */}
        {stage === 'sent' && (
          <div style={{ textAlign: 'center', padding: '3rem 1.5rem' }} role="status">
            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }} aria-hidden="true">✓</div>
            <div style={{ color: '#1a1a2e', fontFamily: 'var(--font-display)', fontSize: '1.1rem', marginBottom: '0.5rem' }}>Email Sent</div>
            <div style={{ color: '#666', fontFamily: 'var(--font-body)', fontSize: '0.84rem', marginBottom: '1.5rem' }}>
              to {to}{attachments.length ? ` · ${attachments.length} attachment${attachments.length === 1 ? '' : 's'}` : ''}
            </div>
            <button style={btnPrimary} onClick={() => onClose(true)}>Done</button>
          </div>
        )}

        {/* Fields */}
        {stage !== 'sent' && (
          <div style={{ padding: '1rem 1.5rem', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div>
              <label htmlFor="composer-to" style={labelStyle}>To</label>
              <input id="composer-to" type="email" value={to} onChange={e => setTo(e.target.value)} placeholder="recipient@venue.com" style={inputStyle} />
            </div>

            <div>
              <label htmlFor="composer-subject" style={labelStyle}>Subject</label>
              <input id="composer-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Email subject line…" style={inputStyle} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label htmlFor="composer-body" style={labelStyle}>Message</label>
              <textarea
                id="composer-body"
                value={body}
                onChange={e => setBody(e.target.value)}
                placeholder='Type your email, pick a template above, or click "Generate with AI".'
                style={{ ...inputStyle, minHeight: 260, resize: 'vertical', lineHeight: 1.7 }}
              />
            </div>

            {/* Attachments */}
            <section aria-label="Attachments">
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '0.5rem', flexWrap: 'wrap' }}>
                <span style={labelStyle}>Attachments</span>
                {attachments.length > 0 && (
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: '0.67rem', color: '#666' }}>
                    {attachments.length}/{MAX_ATTACHMENTS} · {formatBytes(totalBytes) || '—'} of 15 MB
                  </span>
                )}
              </div>

              {attachments.length > 0 && (
                <ul style={{ listStyle: 'none', margin: '0 0 0.5rem', padding: 0, display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {attachments.map((a, i) => (
                    <li key={`${a.source}-${a.source === 'library' ? a.id : a.path}`}
                      style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', background: '#fff', border: '1px solid #ddd', borderRadius: 999, padding: '0.2rem 0.3rem 0.2rem 0.7rem', fontSize: '0.8rem', color: '#1a1a2e', maxWidth: '100%' }}>
                      <span aria-hidden="true">📎</span>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 220 }} title={a.name}>{a.name}</span>
                      {a.size ? <span style={{ color: '#888', fontSize: '0.72rem' }}>{formatBytes(a.size)}</span> : null}
                      <button type="button" onClick={() => removeAttachment(i)} aria-label={`Remove ${a.name}`} disabled={stage === 'sending'}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#888', fontSize: '0.95rem', minWidth: 28, minHeight: 28 }}>✕</button>
                    </li>
                  ))}
                </ul>
              )}

              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                <input ref={fileInputRef} type="file" multiple hidden onChange={e => onPickComputerFiles(e.target.files)} />
                <button type="button" style={isWorking ? btnOff(btnBase) : btnBase} disabled={isWorking} onClick={() => fileInputRef.current?.click()}>
                  {uploading > 0 ? 'Uploading…' : '📎 Attach from computer'}
                </button>
                <button type="button" style={stage === 'sending' ? btnOff(btnBase) : btnBase} disabled={stage === 'sending'}
                  aria-expanded={bandFilesOpen} aria-controls="composer-band-files" onClick={toggleBandFiles}>
                  {bandFilesOpen ? 'Hide band files' : 'Attach band files'}
                </button>
              </div>

              {bandFilesOpen && (
                <div id="composer-band-files" style={{ marginTop: '0.5rem', background: '#fff', border: '1px solid #ddd', borderRadius: 4, maxHeight: 200, overflowY: 'auto' }}>
                  {bandFiles === null && <div style={{ padding: '0.75rem', color: '#666', fontSize: '0.82rem' }}>Loading band files…</div>}
                  {bandFiles?.length === 0 && (
                    <div style={{ padding: '0.75rem', color: '#666', fontSize: '0.82rem' }}>
                      No band files yet. Upload riders, stage plots and photos on the Media page.
                    </div>
                  )}
                  {bandFiles?.map(f => {
                    const checked = attachments.some(a => a.source === 'library' && a.id === f.id);
                    return (
                      <label key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.75rem', borderBottom: '1px solid #f0eee9', cursor: 'pointer', fontSize: '0.84rem', color: '#1a1a2e', minHeight: 40 }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleBandFile(f)} />
                        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bandFileLabel(f)}</span>
                        <span style={{ color: '#888', fontSize: '0.72rem' }}>{formatBytes(f.size)}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Save-as-template panel */}
            {saveOpen && (
              <div style={{ background: '#fff', border: '1px solid #e2c48a', borderRadius: 4, padding: '0.75rem' }}>
                <label htmlFor="composer-template-title" style={labelStyle}>Template title</label>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <input
                    id="composer-template-title"
                    autoFocus
                    value={templateTitle}
                    onChange={e => { setTemplateTitle(e.target.value); setTitleTaken(false); }}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void saveTemplate(false); } }}
                    placeholder="e.g. Brewery pitch — fall"
                    maxLength={120}
                    style={{ ...inputStyle, flex: '1 1 220px', width: 'auto' }}
                  />
                  {!titleTaken && (
                    <button type="button" style={savingTemplate ? btnOff(btnPrimary) : btnPrimary} disabled={savingTemplate} onClick={() => saveTemplate(false)}>
                      {savingTemplate ? 'Saving…' : 'Save'}
                    </button>
                  )}
                  <button type="button" style={btnBase} onClick={() => { setSaveOpen(false); setTitleTaken(false); }}>Cancel</button>
                </div>
                {titleTaken && (
                  <div role="alert" style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: '#1a1a2e', display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    A template called “{templateTitle.trim()}” already exists.
                    <button type="button" style={savingTemplate ? btnOff(btnPrimary) : btnPrimary} disabled={savingTemplate} onClick={() => saveTemplate(true)}>
                      Replace it
                    </button>
                  </div>
                )}
                <div style={{ marginTop: '0.4rem', fontSize: '0.74rem', color: '#666' }}>Saves the subject and message. Attachments and the recipient aren&apos;t saved in templates.</div>
              </div>
            )}

            <div aria-live="polite" style={{ minHeight: '1.1rem' }}>
              {stage === 'generating' && <span style={{ color: '#666', fontSize: '0.82rem' }}>Writing a draft with AI…</span>}
              {notice && !error && <span style={{ color: '#047857', fontSize: '0.82rem' }}>✓ {notice}</span>}
              {error && <span role="alert" style={{ color: '#b91c1c', fontSize: '0.82rem' }}>{error}</span>}
            </div>
          </div>
        )}

        {/* Footer */}
        {stage !== 'sent' && (
          <div style={{ padding: '0.85rem 1.5rem', borderTop: '1px solid #e8e5df', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: '0.5rem', flexWrap: 'wrap' }}>
            <button type="button" onClick={openSaveTemplate} disabled={isWorking || saveOpen} style={isWorking || saveOpen ? btnOff(btnBase) : btnBase}>
              Save as template
            </button>
            <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
              <button type="button" onClick={generateWithAI} disabled={isWorking} style={isWorking ? btnOff(btnBase) : btnBase}>
                {stage === 'generating' ? 'Writing…' : 'Generate with AI'}
              </button>
              <button type="button" onClick={saveDraft} disabled={draftSaving || isWorking} style={draftSaving || isWorking ? btnOff(btnBase) : btnBase}>
                {draftSaving ? 'Saving…' : 'Save draft'}
              </button>
              <button type="button" onClick={send} disabled={isWorking} aria-busy={stage === 'sending'} style={isWorking ? btnOff(btnPrimary) : btnPrimary}>
                {stage === 'sending' ? 'Sending…' : uploading > 0 ? 'Uploading…' : 'Send'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
