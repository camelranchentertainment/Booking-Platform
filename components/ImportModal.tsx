import React, { useState, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

type ImportType = 'venues' | 'shows';
type Phase = 'upload' | 'parsing' | 'review' | 'saving' | 'complete';

interface ImportModalProps {
  defaultType?: ImportType;
  onClose: () => void;
  onComplete?: () => void;
}

const TH: React.CSSProperties = {
  padding: '0.4rem 0.65rem',
  textAlign: 'left',
  fontFamily: 'var(--font-body)',
  fontWeight: 700,
  fontSize: '0.7rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  padding: '0.4rem 0.65rem',
  color: 'var(--text-secondary)',
  fontSize: '0.78rem',
  maxWidth: 160,
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};
const DUP_BADGE: React.CSSProperties = {
  fontSize: '0.68rem',
  background: 'rgba(251,191,36,0.12)',
  color: '#fbbf24',
  padding: '0.1rem 0.45rem',
  borderRadius: '3px',
  whiteSpace: 'nowrap',
};
const NEW_BADGE: React.CSSProperties = {
  fontSize: '0.68rem',
  background: 'rgba(52,211,153,0.12)',
  color: '#34d399',
  padding: '0.1rem 0.45rem',
  borderRadius: '3px',
  whiteSpace: 'nowrap',
};

export default function ImportModal({ defaultType = 'venues', onClose, onComplete }: ImportModalProps) {
  const [phase, setPhase]           = useState<Phase>('upload');
  const [importType, setImportType] = useState<ImportType>(defaultType);
  const [dragOver, setDragOver]     = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError]           = useState('');
  const [parsingMsg, setParsingMsg] = useState('Reading document...');
  const [parseResult, setParseResult] = useState<any>(null);
  const [checked, setChecked]       = useState<Set<number>>(new Set());
  const [saveResult, setSaveResult] = useState<{ saved: number; skipped: number; errors: string[] } | null>(null);
  const fileInputRef                = useRef<HTMLInputElement>(null);

  const ALLOWED_EXTS = ['csv', 'txt', 'xlsx', 'xls', 'pdf'];

  const validateFile = (file: File): string | null => {
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (!ALLOWED_EXTS.includes(ext)) return 'Unsupported file type. Use CSV, Excel (.xlsx, .xls), or PDF.';
    if (file.size > 20 * 1024 * 1024) return 'File exceeds the 20 MB limit.';
    return null;
  };

  const pickFile = (file: File) => {
    const err = validateFile(file);
    if (err) { setError(err); return; }
    setSelectedFile(file);
    setError('');
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) pickFile(file);
  }, []);

  const items: any[] = parseResult
    ? importType === 'venues' ? (parseResult.venues ?? []) : (parseResult.shows ?? [])
    : [];

  const dupCount = items.filter(v => v._duplicate).length;

  // ── Parse ──────────────────────────────────────────────────────────────────
  const doParse = async () => {
    if (!selectedFile) return;
    setPhase('parsing');
    setError('');
    setParsingMsg('Reading document...');
    const t = setTimeout(() => setParsingMsg('AI is extracting data...'), 1800);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const fd = new FormData();
      fd.append('file', selectedFile);
      fd.append('type', importType);

      const res = await fetch('/api/import/parse', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Parse failed');
        setPhase('upload');
        return;
      }

      const list: any[] = importType === 'venues' ? (json.data.venues ?? []) : (json.data.shows ?? []);
      setParseResult(json.data);
      // Pre-select all non-duplicate rows
      setChecked(new Set(list.map((_, i) => i).filter(i => !list[i]._duplicate)));
      setPhase('review');
    } catch (e: any) {
      setError('Network error: ' + e.message);
      setPhase('upload');
    } finally {
      clearTimeout(t);
    }
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const doSave = async () => {
    if (!parseResult) return;
    setPhase('saving');

    const kept = items.filter((_, i) => checked.has(i));
    const payload = importType === 'venues' ? { venues: kept } : { shows: kept };

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/import/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({ type: importType, data: payload }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Save failed');
        setPhase('review');
        return;
      }
      setSaveResult({ saved: json.saved, skipped: json.skipped, errors: json.errors ?? [] });
      setPhase('complete');
    } catch (e: any) {
      setError('Network error: ' + e.message);
      setPhase('review');
    }
  };

  const toggleRow = (i: number) => {
    setChecked(prev => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  };

  const toggleAll = () => {
    setChecked(checked.size === items.length ? new Set() : new Set(items.map((_, i) => i)));
  };

  const isBlocking = phase === 'parsing' || phase === 'saving';
  const modalTitle = phase === 'complete' ? 'Import Complete'
    : importType === 'venues' ? 'Import Venue List' : 'Import Show Schedule';

  return (
    <div className="modal-backdrop" onClick={isBlocking ? undefined : onClose}>
      <div
        className="modal"
        style={{ maxWidth: phase === 'review' ? 800 : 520, width: '94vw' }}
        onClick={e => e.stopPropagation()}
      >
        {/* ── Header ── */}
        <div className="modal-header">
          <h3 className="modal-title">{modalTitle}</h3>
          {!isBlocking && (
            <button className="modal-close" onClick={onClose}>✕</button>
          )}
        </div>

        {/* ── Upload ── */}
        {phase === 'upload' && (
          <div>
            {/* Type tabs */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem' }}>
              {(['venues', 'shows'] as const).map(t => (
                <button
                  key={t}
                  onClick={() => { setImportType(t); setSelectedFile(null); setError(''); }}
                  style={{
                    flex: 1,
                    padding: '0.6rem',
                    border: `1px solid ${importType === t ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    background: importType === t ? 'rgba(200,146,26,0.1)' : 'transparent',
                    color: importType === t ? 'var(--accent)' : 'var(--text-muted)',
                    fontFamily: 'var(--font-body)',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase' as const,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  {t === 'venues' ? 'Venue List' : 'Show Schedule'}
                </button>
              ))}
            </div>

            {/* Drop zone */}
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--accent)' : selectedFile ? '#34d399' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                padding: '2.5rem 1rem',
                textAlign: 'center' as const,
                cursor: 'pointer',
                background: dragOver ? 'rgba(200,146,26,0.04)' : 'transparent',
                transition: 'border-color 0.15s, background 0.15s',
                marginBottom: '1rem',
              }}
            >
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem', userSelect: 'none' }}>
                {selectedFile ? '✓' : '📂'}
              </div>
              {selectedFile ? (
                <div>
                  <div style={{ color: '#34d399', fontWeight: 600, fontSize: '0.88rem' }}>{selectedFile.name}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', marginTop: '0.25rem' }}>
                    {(selectedFile.size / 1024).toFixed(0)} KB · click to change
                  </div>
                </div>
              ) : (
                <div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: '0.3rem' }}>
                    Drag &amp; drop or click to browse
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.76rem', fontFamily: 'var(--font-mono)' }}>
                    CSV · Excel (.xlsx, .xls) · PDF · Max 20 MB
                  </div>
                </div>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt,.xlsx,.xls,.pdf"
                style={{ display: 'none' }}
                onChange={e => { if (e.target.files?.[0]) pickFile(e.target.files[0]); e.target.value = ''; }}
              />
            </div>

            {error && (
              <div style={{ color: '#ef4444', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={doParse} disabled={!selectedFile}>
                Parse File
              </button>
            </div>
          </div>
        )}

        {/* ── Parsing / Saving spinner ── */}
        {(phase === 'parsing' || phase === 'saving') && (
          <div style={{ textAlign: 'center', padding: '3rem 1rem' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--text-muted)', marginBottom: '1rem', letterSpacing: '0.1em' }}>
              ···
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
              {phase === 'parsing' ? parsingMsg : 'Saving to database...'}
            </div>
          </div>
        )}

        {/* ── Review ── */}
        {phase === 'review' && (
          <div>
            <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '0.75rem', fontFamily: 'var(--font-body)', fontSize: '0.8rem', flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-muted)' }}>
                <strong style={{ color: 'var(--text-primary)' }}>{items.length}</strong>{' '}
                {importType === 'venues' ? 'venues' : 'shows'} found
              </span>
              {dupCount > 0 && (
                <span style={{ color: '#fbbf24' }}>{dupCount} already in database</span>
              )}
              <span style={{ color: '#34d399' }}>{checked.size} selected</span>
            </div>

            {(parseResult?.warnings?.length ?? 0) > 0 && (
              <div style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.75rem', marginBottom: '0.75rem', fontSize: '0.78rem', color: '#f59e0b' }}>
                {parseResult.warnings.map((w: string, i: number) => (
                  <div key={i}>⚠ {w}</div>
                ))}
              </div>
            )}

            <div style={{ overflowX: 'auto', maxHeight: 360, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-overlay)', position: 'sticky', top: 0 }}>
                    <th style={{ ...TH, width: 36 }}>
                      <input
                        type="checkbox"
                        checked={checked.size === items.length && items.length > 0}
                        onChange={toggleAll}
                      />
                    </th>
                    {importType === 'venues' ? (
                      <>
                        <th style={TH}>Name</th>
                        <th style={TH}>City</th>
                        <th style={TH}>State</th>
                        <th style={TH}>Email</th>
                        <th style={TH}>Phone</th>
                        <th style={TH}>Status</th>
                      </>
                    ) : (
                      <>
                        <th style={TH}>Date</th>
                        <th style={TH}>Venue</th>
                        <th style={TH}>City</th>
                        <th style={TH}>State</th>
                        <th style={TH}>Fee</th>
                        <th style={TH}>Status</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {items.map((item: any, i: number) => (
                    <tr
                      key={i}
                      onClick={() => toggleRow(i)}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: item._duplicate ? 'rgba(251,191,36,0.04)' : 'transparent',
                        cursor: 'pointer',
                        opacity: checked.has(i) ? 1 : 0.4,
                        transition: 'opacity 0.1s',
                      }}
                    >
                      <td style={{ ...TD, maxWidth: 'none' }}>
                        <input
                          type="checkbox"
                          checked={checked.has(i)}
                          onChange={() => toggleRow(i)}
                          onClick={e => e.stopPropagation()}
                        />
                      </td>
                      {importType === 'venues' ? (
                        <>
                          <td style={{ ...TD, fontWeight: 500, color: 'var(--text-primary)' }}>{item.name || '—'}</td>
                          <td style={TD}>{item.city || '—'}</td>
                          <td style={TD}>{item.state || '—'}</td>
                          <td style={TD}>{item.email || '—'}</td>
                          <td style={TD}>{item.phone || '—'}</td>
                          <td style={TD}>
                            {item._duplicate
                              ? <span style={DUP_BADGE}>Already exists</span>
                              : <span style={NEW_BADGE}>New</span>}
                          </td>
                        </>
                      ) : (
                        <>
                          <td style={{ ...TD, fontFamily: 'var(--font-mono)', color: 'var(--text-primary)' }}>{item.show_date || '—'}</td>
                          <td style={{ ...TD, fontWeight: 500 }}>{item.venue_name || '—'}</td>
                          <td style={TD}>{item.city || '—'}</td>
                          <td style={TD}>{item.state || '—'}</td>
                          <td style={TD}>{item.fee ? `$${item.fee}` : '—'}</td>
                          <td style={TD}>
                            {item._duplicate
                              ? <span style={DUP_BADGE}>Already exists</span>
                              : <span style={NEW_BADGE}>New</span>}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {error && (
              <div style={{ color: '#ef4444', fontSize: '0.82rem', marginBottom: '0.75rem' }}>{error}</div>
            )}

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button className="btn btn-primary" onClick={doSave} disabled={checked.size === 0}>
                Import {checked.size} Record{checked.size !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        )}

        {/* ── Complete ── */}
        {phase === 'complete' && saveResult && (
          <div>
            <div style={{ display: 'flex', gap: '2.5rem', padding: '1.5rem', background: 'rgba(52,211,153,0.05)', border: '1px solid rgba(52,211,153,0.15)', borderRadius: 'var(--radius)', marginBottom: '1rem' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: '#34d399', lineHeight: 1 }}>
                  {saveResult.saved}
                </div>
                <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', color: 'var(--text-muted)', marginTop: '0.2rem', fontFamily: 'var(--font-body)' }}>
                  SAVED
                </div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--text-muted)', lineHeight: 1 }}>
                  {saveResult.skipped}
                </div>
                <div style={{ fontSize: '0.72rem', letterSpacing: '0.1em', color: 'var(--text-muted)', marginTop: '0.2rem', fontFamily: 'var(--font-body)' }}>
                  SKIPPED
                </div>
              </div>
            </div>

            {saveResult.errors.length > 0 && (
              <div style={{ marginBottom: '1rem', padding: '0.6rem 0.75rem', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 'var(--radius-sm)' }}>
                <div style={{ fontSize: '0.76rem', color: '#ef4444', fontWeight: 700, marginBottom: '0.35rem' }}>Errors:</div>
                {saveResult.errors.map((e, i) => (
                  <div key={i} style={{ fontSize: '0.75rem', color: '#ef4444' }}>• {e}</div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={() => { onComplete?.(); onClose(); }}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
