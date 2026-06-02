import { useState, useEffect, useRef, useCallback } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { useRequireAuth } from '../lib/hooks/useRequireAuth';

type MediaItem = {
  id: string;
  file_name: string;
  file_type: string;
  mime_type: string;
  file_size: number;
  public_url: string;
  alt_text: string | null;
  is_primary_logo: boolean;
  created_at: string;
};

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

const FILE_TYPE_LABELS: Record<string, string> = {
  image:    'Image',
  logo:     'Logo',
  document: 'Document',
  audio:    'Audio',
  video:    'Video',
};

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function MediaCard({
  item,
  onDelete,
}: {
  item: MediaItem;
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const isImage = item.mime_type.startsWith('image/');

  const handleDelete = async () => {
    setDeleting(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setDeleting(false); return; }
    const res = await fetch(`/api/media/${item.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (res.ok) {
      onDelete(item.id);
    } else {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  return (
    <div style={{
      background: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Thumbnail */}
      <div style={{
        width: '100%', paddingBottom: '66%', position: 'relative',
        background: 'rgba(0,0,0,0.3)',
      }}>
        {isImage ? (
          <img
            src={item.public_url}
            alt={item.alt_text || item.file_name}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: 'var(--font-display)', fontSize: '2.5rem', color: 'var(--text-muted)',
          }}>
            {item.file_type === 'document' ? 'PDF'
              : item.file_type === 'audio' ? '♫'
              : item.file_type === 'video' ? '▶'
              : '?'}
          </div>
        )}
        {item.is_primary_logo && (
          <div style={{
            position: 'absolute', top: 6, left: 6,
            background: 'var(--accent)', color: '#000',
            fontSize: '0.6rem', fontFamily: 'var(--font-body)',
            fontWeight: 700, letterSpacing: '0.08em',
            padding: '2px 6px', borderRadius: 3, textTransform: 'uppercase',
          }}>
            Logo
          </div>
        )}
      </div>

      {/* Info + actions */}
      <div style={{ padding: '0.65rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.file_name}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
          <span>{FILE_TYPE_LABELS[item.file_type] || item.file_type}</span>
          <span>·</span>
          <span>{formatBytes(item.file_size)}</span>
        </div>

        <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.35rem', flexWrap: 'wrap' }}>
          <a
            href={item.public_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm"
            style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', textDecoration: 'none' }}
          >
            View
          </a>

          {!confirmDelete ? (
            <button
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', color: '#f87171' }}
              onClick={() => setConfirmDelete(true)}
            >
              Delete
            </button>
          ) : (
            <>
              <button
                className="btn btn-sm"
                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: '#f87171', color: '#000', border: 'none' }}
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? 'Deleting…' : 'Confirm'}
              </button>
              <button
                className="btn btn-ghost btn-sm"
                style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
              >
                Cancel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MediaLibraryPage() {
  useRequireAuth('band_admin');

  const [items, setItems] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [altText, setAltText] = useState('');
  const [isPrimaryLogo, setIsPrimaryLogo] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setLoading(false); return; }

    const { data } = await supabase
      .from('media_library')
      .select('*')
      .order('created_at', { ascending: false });

    setItems(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openModal = (file?: File) => {
    setUploadState('idle');
    setUploadError('');
    setAltText('');
    setIsPrimaryLogo(false);
    setPendingFile(file || null);
    setShowUploadModal(true);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) openModal(file);
    e.target.value = '';
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) openModal(file);
  }, []);

  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); setDragOver(true); };
  const handleDragLeave = () => setDragOver(false);

  const upload = async () => {
    if (!pendingFile) return;
    setUploadState('uploading');
    setUploadError('');
    setUploadProgress(`Uploading ${pendingFile.name}…`);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setUploadState('error');
      setUploadError('Not authenticated');
      return;
    }

    const fd = new FormData();
    fd.append('file', pendingFile);
    if (altText) fd.append('alt_text', altText);
    if (isPrimaryLogo) {
      fd.append('is_primary_logo', 'true');
      fd.append('file_type', 'logo');
    }

    try {
      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}` },
        body: fd,
      });

      if (!res.ok) {
        const err = await res.json();
        setUploadState('error');
        setUploadError(err.error || 'Upload failed');
        return;
      }

      const record: MediaItem = await res.json();
      setItems(prev => [record, ...prev]);
      setUploadState('done');
      setUploadProgress('');
      setTimeout(() => {
        setShowUploadModal(false);
        setPendingFile(null);
      }, 800);
    } catch (err: any) {
      setUploadState('error');
      setUploadError(err.message || 'Upload failed');
    }
  };

  const handleDelete = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const filtered = filter === 'all' ? items : items.filter(i => i.file_type === filter);

  const typeCounts: Record<string, number> = { all: items.length };
  items.forEach(i => { typeCounts[i.file_type] = (typeCounts[i.file_type] || 0) + 1; });

  const filterTabs = ['all', 'image', 'logo', 'document', 'audio', 'video'].filter(
    t => t === 'all' || (typeCounts[t] || 0) > 0
  );

  return (
    <AppShell requireRole="band_admin">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1 }}>
              MEDIA LIBRARY
            </h1>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              {items.length} file{items.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button
            className="btn btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            + Upload
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,audio/*,video/*" onChange={handleFilePick} style={{ display: 'none' }} />
        </div>

        {/* Filter tabs */}
        {filterTabs.length > 1 && (
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
            {filterTabs.map(t => (
              <button
                key={t}
                onClick={() => setFilter(t)}
                className={`btn btn-sm ${filter === t ? 'btn-primary' : 'btn-ghost'}`}
                style={{ fontSize: '0.75rem', padding: '0.25rem 0.75rem', textTransform: 'capitalize' }}
              >
                {t === 'all' ? 'All' : (FILE_TYPE_LABELS[t] || t)}
                {' '}
                <span style={{ opacity: 0.6 }}>({typeCounts[t] || 0})</span>
              </button>
            ))}
          </div>
        )}

        {/* Drop zone + grid */}
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            minHeight: 200,
            border: dragOver ? '2px dashed var(--accent)' : '2px dashed transparent',
            borderRadius: 10,
            transition: 'border-color 0.15s',
            padding: dragOver ? '0.5rem' : 0,
          }}
        >
          {loading ? (
            <div style={{ padding: '3rem', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
              Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div
              onClick={() => fileInputRef.current?.click()}
              style={{
                padding: '4rem 2rem', textAlign: 'center',
                border: '2px dashed rgba(255,255,255,0.1)',
                borderRadius: 10,
                cursor: 'pointer',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--text-muted)', lineHeight: 1, marginBottom: '0.75rem' }}>
                +
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {filter !== 'all' ? `No ${FILE_TYPE_LABELS[filter] || filter} files yet.` : 'Drop files here or click to upload.'}
              </div>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
              gap: '1rem',
            }}>
              {filtered.map(item => (
                <MediaCard key={item.id} item={item} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Upload Modal */}
      {showUploadModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '1rem',
        }}>
          <div style={{
            background: 'var(--bg-card, #1a1208)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            padding: '1.5rem',
            width: '100%', maxWidth: 440,
            display: 'flex', flexDirection: 'column', gap: '1rem',
          }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '1.5rem', color: 'var(--text-primary)', lineHeight: 1 }}>
              UPLOAD FILE
            </div>

            {pendingFile && (
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', padding: '0.6rem 0.75rem', borderRadius: 6 }}>
                <span style={{ color: 'var(--text-primary)' }}>{pendingFile.name}</span>
                {' · '}
                {formatBytes(pendingFile.size)}
              </div>
            )}

            {!pendingFile && (
              <div
                onClick={() => fileInputRef.current?.click()}
                style={{
                  border: '2px dashed rgba(255,255,255,0.15)', borderRadius: 8,
                  padding: '2rem', textAlign: 'center', cursor: 'pointer',
                  fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)',
                }}
              >
                Click to select a file
              </div>
            )}

            <div className="field">
              <label className="field-label">Alt text (optional)</label>
              <input
                className="input"
                placeholder="Describe the file for accessibility"
                value={altText}
                onChange={e => setAltText(e.target.value)}
                disabled={uploadState === 'uploading'}
              />
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
              <input
                type="checkbox"
                checked={isPrimaryLogo}
                onChange={e => setIsPrimaryLogo(e.target.checked)}
                disabled={uploadState === 'uploading'}
              />
              Set as primary act logo
            </label>

            {uploadState === 'error' && (
              <div style={{ color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>
                {uploadError}
              </div>
            )}

            {uploadState === 'uploading' && (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>
                {uploadProgress}
              </div>
            )}

            {uploadState === 'done' && (
              <div style={{ color: '#4ade80', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>
                Uploaded successfully.
              </div>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost"
                onClick={() => { setShowUploadModal(false); setPendingFile(null); }}
                disabled={uploadState === 'uploading'}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={upload}
                disabled={!pendingFile || uploadState === 'uploading' || uploadState === 'done'}
              >
                {uploadState === 'uploading' ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
