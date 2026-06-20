import { useState, useEffect, useRef, useCallback } from 'react';
import AppShell from '../components/layout/AppShell';
import { supabase } from '../lib/supabase';
import { useRequireAuth } from '../lib/hooks/useRequireAuth';

// ─── Types ────────────────────────────────────────────────────────────────────

type MediaItem = {
  id: string;
  file_name: string;
  file_type: string;
  mime_type: string;
  file_size_bytes: number;
  public_url: string;
  alt_text: string | null;
  is_primary_logo: boolean;
  created_at: string;
};

type Booking = {
  id: string;
  show_date: string | null;
  status: string;
  venue: { name: string; city: string | null; state: string | null } | null;
};

type EpkPhoto = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  thumbnailUrl: string | null;
};

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

function formatShowDate(dateStr: string | null): string {
  if (!dateStr) return 'Date TBD';
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── MediaCard ────────────────────────────────────────────────────────────────

function MediaCard({ item, onDelete }: { item: MediaItem; onDelete: (id: string) => void }) {
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
      <div style={{ width: '100%', paddingBottom: '66%', position: 'relative', background: 'rgba(0,0,0,0.3)' }}>
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
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

      <div style={{ padding: '0.65rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '0.3rem', flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {item.file_name}
        </div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '0.5rem' }}>
          <span>{FILE_TYPE_LABELS[item.file_type] || item.file_type}</span>
          <span>·</span>
          <span>{formatBytes(item.file_size_bytes)}</span>
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MediaLibraryPage() {
  const { user, profile } = useRequireAuth('band_admin');

  // ── Media library state ──────────────────────────────────────────────────
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

  // ── Poster section state ─────────────────────────────────────────────────
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [epkPhotos, setEpkPhotos] = useState<EpkPhoto[]>([]);
  const [posterBookingId, setPosterBookingId] = useState('');
  const [posterStyle, setPosterStyle] = useState<'americana' | 'electric' | 'western'>('americana');
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState('');
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [generatedBlob, setGeneratedBlob] = useState<Blob | null>(null);
  const [savingToLibrary, setSavingToLibrary] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  // Optional fields
  const [showTicketPrice, setShowTicketPrice] = useState(false);
  const [ticketPrice, setTicketPrice] = useState('');
  const [showOpener, setShowOpener] = useState(false);
  const [openerName, setOpenerName] = useState('');
  const [showAgeRestriction, setShowAgeRestriction] = useState(false);
  const [ageRestriction, setAgeRestriction] = useState('');
  const [showTicketUrl, setShowTicketUrl] = useState(false);
  const [ticketUrl, setTicketUrl] = useState('');

  // Ref to track blob URL so we can revoke it on unmount / regeneration
  const generatedUrlRef = useRef<string | null>(null);

  // ── Media library data ────────────────────────────────────────────────────

  const load = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const { data } = await supabase
        .from('media_library')
        .select('*')
        .order('created_at', { ascending: false });
      setItems(data || []);
    } catch (err) {
      console.error('media load:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  // ── Poster section data ───────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.act_id) return;
    fetchPosterData(profile.act_id);
  }, [profile?.act_id]);

  async function fetchPosterData(actId: string) {
    // Fetch non-cancelled shows with a date, soonest first
    const { data: bookingRows } = await supabase
      .from('bookings')
      .select('id, show_date, status, venue:venues(name, city, state)')
      .eq('act_id', actId)
      .not('status', 'in', '("cancelled")')
      .not('show_date', 'is', null)
      .order('show_date', { ascending: true });
    setBookings((bookingRows || []) as unknown as Booking[]);

    // Fetch EPK-marked photos (media_assets with is_featured=true, category=photo)
    // Wrapped in try/catch — table may not exist if Phase 14 migration hasn't run yet.
    try {
      const { data: assetRows, error } = await supabase
        .from('media_assets')
        .select('id, file_name, storage_path, mime_type')
        .eq('act_id', actId)
        .eq('category', 'photo')
        .eq('is_featured', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error || !assetRows?.length) {
        setEpkPhotos([]);
        return;
      }

      // Batch-fetch signed URLs for thumbnails (60-minute TTL)
      const paths = assetRows.map(r => r.storage_path).filter(Boolean);
      let signedMap: Record<string, string> = {};

      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from('media-assets')
          .createSignedUrls(paths, 3600);
        (signed || []).forEach(s => { if (s.signedUrl && s.path) signedMap[s.path] = s.signedUrl; });
      }

      setEpkPhotos(
        assetRows.map(r => ({
          id:           r.id,
          file_name:    r.file_name,
          storage_path: r.storage_path,
          mime_type:    r.mime_type,
          thumbnailUrl: signedMap[r.storage_path] ?? null,
        }))
      );
    } catch {
      // media_assets table not yet available — swallow silently
      setEpkPhotos([]);
    }
  }

  // Auto-select most recent EPK photo when the list first loads
  useEffect(() => {
    if (epkPhotos.length > 0 && selectedPhotoId === null) {
      setSelectedPhotoId(epkPhotos[0].id);
    }
  }, [epkPhotos]); // eslint-disable-line react-hooks/exhaustive-deps

  // Revoke blob URL when a new one is set, and on unmount
  useEffect(() => {
    return () => {
      if (generatedUrlRef.current) URL.revokeObjectURL(generatedUrlRef.current);
    };
  }, []);

  // ── Poster handlers ───────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!posterBookingId) return;

    // Revoke previous blob URL before replacing it
    if (generatedUrlRef.current) {
      URL.revokeObjectURL(generatedUrlRef.current);
      generatedUrlRef.current = null;
    }
    setGeneratedUrl(null);
    setGeneratedBlob(null);
    setSaveMsg('');
    setGenerating(true);
    setGenerateError('');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const includedFields: Record<string, string> = {};
      if (showTicketPrice && ticketPrice.trim()) includedFields.ticketPrice = ticketPrice.trim();
      if (showOpener && openerName.trim())       includedFields.openerName  = openerName.trim();
      if (showAgeRestriction && ageRestriction.trim()) includedFields.ageRestriction = ageRestriction.trim();
      if (showTicketUrl && ticketUrl.trim())     includedFields.ticketUrl   = ticketUrl.trim();

      const res = await fetch('/api/posters/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          bookingId:      posterBookingId,
          style:          posterStyle,
          mediaAssetId:   selectedPhotoId || undefined,
          includedFields,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || `Generation failed (${res.status})`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      generatedUrlRef.current = url;
      setGeneratedBlob(blob);
      setGeneratedUrl(url);
    } catch (err: any) {
      setGenerateError(err.message || 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!generatedBlob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(generatedBlob);
    const booking = bookings.find(b => b.id === posterBookingId);
    const dateStr  = booking?.show_date?.replace(/-/g, '') || 'poster';
    a.download = `poster-${posterStyle}-${dateStr}.png`;
    a.click();
    // Revoke after a tick so the browser has time to start the download
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const handleSaveToLibrary = async () => {
    if (!generatedBlob || !profile?.act_id || !user?.id || !posterBookingId) return;
    setSavingToLibrary(true);
    setSaveMsg('');

    try {
      const fileName = `poster-${posterStyle}-${Date.now()}.png`;
      const storagePath = `${profile.act_id}/${fileName}`;

      // 1. Upload PNG to media-assets private bucket
      const { error: uploadErr } = await supabase.storage
        .from('media-assets')
        .upload(storagePath, generatedBlob, { contentType: 'image/png' });
      if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

      // 2. Create media_assets metadata row (category: poster)
      const { data: assetRow, error: assetErr } = await supabase
        .from('media_assets')
        .insert({
          act_id:       profile.act_id,
          uploaded_by:  user.id,
          label:        `Poster — ${posterStyle} — ${formatShowDate(bookings.find(b => b.id === posterBookingId)?.show_date ?? null)}`,
          category:     'poster',
          storage_path: storagePath,
          file_name:    fileName,
          file_size:    generatedBlob.size,
          mime_type:    'image/png',
          is_public:    false,
          is_featured:  false,
          width:        1080,
          height:       1512,
        })
        .select('id')
        .single();
      if (assetErr) throw new Error(`media_assets insert: ${assetErr.message}`);

      // 3. Create generated_posters record
      const includedFieldsObj: Record<string, string> = {};
      if (showTicketPrice && ticketPrice.trim()) includedFieldsObj.ticketPrice = ticketPrice.trim();
      if (showOpener && openerName.trim())       includedFieldsObj.openerName  = openerName.trim();
      if (showAgeRestriction && ageRestriction.trim()) includedFieldsObj.ageRestriction = ageRestriction.trim();
      if (showTicketUrl && ticketUrl.trim())     includedFieldsObj.ticketUrl   = ticketUrl.trim();

      const { error: posterErr } = await supabase
        .from('generated_posters')
        .insert({
          act_id:               profile.act_id,
          booking_id:           posterBookingId,
          media_asset_id:       selectedPhotoId || null,
          style:                posterStyle,
          included_fields:      includedFieldsObj,
          output_media_asset_id: assetRow?.id || null,
          created_by:           user.id,
        });
      if (posterErr) throw new Error(`generated_posters insert: ${posterErr.message}`);

      setSaveMsg('Saved to library ✓');
    } catch (err: any) {
      setSaveMsg(`Error: ${err.message}`);
    } finally {
      setSavingToLibrary(false);
    }
  };

  // ── Media library handlers ────────────────────────────────────────────────

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

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = filter === 'all' ? items : items.filter(i => i.file_type === filter);

  const typeCounts: Record<string, number> = { all: items.length };
  items.forEach(i => { typeCounts[i.file_type] = (typeCounts[i.file_type] || 0) + 1; });

  const filterTabs = ['all', 'image', 'logo', 'document', 'audio', 'video'].filter(
    t => t === 'all' || (typeCounts[t] || 0) > 0
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell requireRole="band_admin">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ── Media Library header ───────────────────────────────────────── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '2.2rem', color: 'var(--text-primary)', margin: 0, lineHeight: 1 }}>
              MEDIA LIBRARY
            </h1>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
              {items.length} file{items.length !== 1 ? 's' : ''}
            </div>
          </div>
          <button className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>
            + Upload
          </button>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,audio/*,video/*" onChange={handleFilePick} style={{ display: 'none' }} />
        </div>

        {/* ── Filter tabs ────────────────────────────────────────────────── */}
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

        {/* ── Drop zone + grid ───────────────────────────────────────────── */}
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
                borderRadius: 10, cursor: 'pointer', transition: 'border-color 0.15s',
              }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)')}
            >
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '3rem', color: 'var(--text-muted)', lineHeight: 1, marginBottom: '0.75rem' }}>+</div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                {filter !== 'all' ? `No ${FILE_TYPE_LABELS[filter] || filter} files yet.` : 'Drop files here or click to upload.'}
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
              {filtered.map(item => (
                <MediaCard key={item.id} item={item} onDelete={handleDelete} />
              ))}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SHOW POSTERS
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{ marginTop: '3.5rem', paddingTop: '2.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', color: 'var(--text-primary)', margin: '0 0 0.25rem', lineHeight: 1 }}>
              SHOW POSTERS
            </h2>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Generate 1080 × 1512 px PNG posters for your shows
            </div>
          </div>

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>

            {/* ── Config column ────────────────────────────────────────────── */}
            <div style={{ flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

              {/* Show selector */}
              <div className="field">
                <label className="field-label">Show</label>
                <select
                  className="input"
                  value={posterBookingId}
                  onChange={e => { setPosterBookingId(e.target.value); setSaveMsg(''); }}
                >
                  <option value="">— Select a show —</option>
                  {bookings.map(b => {
                    const venue = b.venue as any;
                    const label = [venue?.name, venue?.city].filter(Boolean).join(', ');
                    return (
                      <option key={b.id} value={b.id}>
                        {label || 'Unnamed venue'} · {formatShowDate(b.show_date)}
                      </option>
                    );
                  })}
                </select>
                {bookings.length === 0 && (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem' }}>
                    No upcoming shows found. Add shows on the Bookings page.
                  </div>
                )}
              </div>

              {/* Style selector */}
              <div className="field">
                <label className="field-label">Style</label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {(['americana', 'electric', 'western'] as const).map(s => (
                    <button
                      key={s}
                      className={`btn btn-sm ${posterStyle === s ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={() => setPosterStyle(s)}
                      style={{ flex: 1, textTransform: 'capitalize' }}
                    >
                      {s.charAt(0).toUpperCase() + s.slice(1)}
                    </button>
                  ))}
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.35rem' }}>
                  {posterStyle === 'americana' && 'Deep sepia tones · gold frame · Bebas Neue headline'}
                  {posterStyle === 'electric'  && 'Full-bleed photo · dark/orange gradient · high contrast'}
                  {posterStyle === 'western'   && 'Nested border frame · desaturated photo · Playfair serif'}
                </div>
              </div>

              {/* Photo picker */}
              <div className="field">
                <label className="field-label">
                  Photo
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.4rem' }}>
                    (EPK-marked photos)
                  </span>
                </label>
                {epkPhotos.length === 0 ? (
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                    No EPK photos yet. Upload photos to Media Assets and mark them as Featured.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px' }}>
                      {epkPhotos.map(photo => (
                        <button
                          key={photo.id}
                          onClick={() => setSelectedPhotoId(photo.id)}
                          title={photo.file_name}
                          style={{
                            flexShrink: 0,
                            width: 76,
                            height: 76,
                            padding: 0,
                            border: selectedPhotoId === photo.id
                              ? '2px solid var(--accent)'
                              : '2px solid rgba(255,255,255,0.12)',
                            borderRadius: 6,
                            overflow: 'hidden',
                            cursor: 'pointer',
                            background: 'rgba(0,0,0,0.3)',
                            transition: 'border-color 0.15s',
                            outline: selectedPhotoId === photo.id ? '2px solid rgba(200,146,26,0.4)' : 'none',
                            outlineOffset: 1,
                          }}
                        >
                          {photo.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={photo.thumbnailUrl}
                              alt={photo.file_name}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.65rem', fontFamily: 'var(--font-body)' }}>
                              img
                            </div>
                          )}
                        </button>
                      ))}
                    </div>
                    {selectedPhotoId && (
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setSelectedPhotoId(null)}
                        style={{ fontSize: '0.7rem', alignSelf: 'flex-start', padding: '0.15rem 0.5rem' }}
                      >
                        Use no photo
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Optional fields */}
              <div className="field">
                <label className="field-label">Optional fields</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

                  {/* Ticket price */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={showTicketPrice}
                        onChange={e => setShowTicketPrice(e.target.checked)}
                      />
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        Ticket price / door cover
                      </span>
                    </label>
                    {showTicketPrice && (
                      <input
                        className="input"
                        placeholder="e.g. $15 advance · $20 door"
                        value={ticketPrice}
                        onChange={e => setTicketPrice(e.target.value)}
                        style={{ marginLeft: '1.4rem' }}
                      />
                    )}
                  </div>

                  {/* Opener */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={showOpener}
                        onChange={e => setShowOpener(e.target.checked)}
                      />
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        Opener / support act
                      </span>
                    </label>
                    {showOpener && (
                      <input
                        className="input"
                        placeholder="e.g. The Desert Sons"
                        value={openerName}
                        onChange={e => setOpenerName(e.target.value)}
                        style={{ marginLeft: '1.4rem' }}
                      />
                    )}
                  </div>

                  {/* Age restriction */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={showAgeRestriction}
                        onChange={e => setShowAgeRestriction(e.target.checked)}
                      />
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        Age restriction
                      </span>
                    </label>
                    {showAgeRestriction && (
                      <input
                        className="input"
                        placeholder="e.g. 21+ · All ages"
                        value={ageRestriction}
                        onChange={e => setAgeRestriction(e.target.value)}
                        style={{ marginLeft: '1.4rem' }}
                      />
                    )}
                  </div>

                  {/* Ticket URL → QR code */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={showTicketUrl}
                        onChange={e => setShowTicketUrl(e.target.checked)}
                      />
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        Ticket link{' '}
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(generates QR code)</span>
                      </span>
                    </label>
                    {showTicketUrl && (
                      <input
                        className="input"
                        type="url"
                        placeholder="https://..."
                        value={ticketUrl}
                        onChange={e => setTicketUrl(e.target.value)}
                        style={{ marginLeft: '1.4rem' }}
                      />
                    )}
                  </div>
                </div>
              </div>

              {generateError && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#f87171' }}>
                  {generateError}
                </div>
              )}

              <button
                className="btn btn-primary"
                onClick={handleGenerate}
                disabled={!posterBookingId || generating}
              >
                {generating ? 'Generating…' : 'Generate Poster'}
              </button>
            </div>

            {/* ── Preview column ───────────────────────────────────────────── */}
            <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

              {/* Preview frame — maintains 1080:1512 aspect ratio */}
              <div style={{
                position: 'relative',
                width: '100%',
                paddingBottom: `${(1512 / 1080) * 100}%`,
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 8,
                overflow: 'hidden',
                background: 'rgba(0,0,0,0.25)',
              }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {generating ? (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      Generating…
                    </div>
                  ) : generatedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={generatedUrl}
                      alt="Generated poster preview"
                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                    />
                  ) : (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem', lineHeight: 1.6 }}>
                      Select a show and click<br />Generate Poster
                    </div>
                  )}
                </div>
              </div>

              {/* Download + Save actions */}
              {generatedUrl && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleDownload}
                    style={{ fontSize: '0.78rem' }}
                  >
                    ↓ Download PNG
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={handleSaveToLibrary}
                    disabled={savingToLibrary}
                    style={{
                      fontSize: '0.78rem',
                      background: 'var(--accent)',
                      color: '#000',
                      border: 'none',
                      opacity: savingToLibrary ? 0.6 : 1,
                    }}
                  >
                    {savingToLibrary ? 'Saving…' : 'Save to Library'}
                  </button>
                  {saveMsg && (
                    <span style={{
                      fontFamily: 'var(--font-body)',
                      fontSize: '0.73rem',
                      color: saveMsg.startsWith('Error') ? '#f87171' : '#4ade80',
                    }}>
                      {saveMsg}
                    </span>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* ── Upload Modal ─────────────────────────────────────────────────── */}
      {showUploadModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 1000, padding: '1rem',
        }}>
          <div style={{
            background: 'var(--bg-card, #1a1208)',
            border: '1px solid var(--border)',
            borderRadius: 10, padding: '1.5rem',
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
