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
  is_featured: boolean;
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

type DocRow = {
  id: string;
  file_name: string;
  file_size_bytes: number;
  created_at: string;
  document_category: string;
  is_current_version: boolean;
  mime_type: string;
};

type UploadState = 'idle' | 'uploading' | 'done' | 'error';

// ─── Constants ────────────────────────────────────────────────────────────────

const DOC_CATEGORIES: { key: string; label: string }[] = [
  { key: 'stage_plot_input_list', label: 'Stage Plot & Input List' },
  { key: 'technical_rider',       label: 'Technical Rider' },
  { key: 'hospitality_rider',     label: 'Hospitality Rider' },
  { key: 'w9',                    label: 'W-9' },
  { key: 'coi_insurance',         label: 'COI / Insurance' },
  { key: 'contact_sheet',         label: 'Contact Sheet' },
  { key: 'bio_one_sheet',         label: 'Bio / One-Sheet' },
];

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

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ─── DocCategoryIcon ─────────────────────────────────────────────────────────
// One distinct glyph per document category, drawn flat in the act's accent
// color so the folder grid is scannable at a glance rather than a wall of
// identical text labels. Kept as inline SVG (no icon-library dependency) and
// sized to a fixed 28x28 box so they align cleanly across the grid.

function DocCategoryIcon({ categoryKey }: { categoryKey: string }) {
  const common = {
    width: 28,
    height: 28,
    viewBox: '0 0 28 28',
    fill: 'none',
    stroke: 'var(--accent)',
    strokeWidth: 1.6,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  switch (categoryKey) {
    case 'stage_plot_input_list':
      // Stage footprint with numbered input markers
      return (
        <svg {...common}>
          <rect x="3" y="5" width="22" height="16" rx="1.5" />
          <circle cx="9" cy="11" r="1.4" fill="var(--accent)" stroke="none" />
          <circle cx="14" cy="15" r="1.4" fill="var(--accent)" stroke="none" />
          <circle cx="19" cy="11" r="1.4" fill="var(--accent)" stroke="none" />
          <path d="M3 21 L11 5" strokeWidth="1" opacity="0.4" />
        </svg>
      );
    case 'technical_rider':
      // Mixer channel strip — sliders at different heights
      return (
        <svg {...common}>
          <line x1="7" y1="4" x2="7" y2="24" />
          <line x1="14" y1="4" x2="14" y2="24" />
          <line x1="21" y1="4" x2="21" y2="24" />
          <rect x="4.5" y="9" width="5" height="3" rx="1" fill="var(--accent)" stroke="none" />
          <rect x="11.5" y="16" width="5" height="3" rx="1" fill="var(--accent)" stroke="none" />
          <rect x="18.5" y="6" width="5" height="3" rx="1" fill="var(--accent)" stroke="none" />
        </svg>
      );
    case 'hospitality_rider':
      // Fork & plate
      return (
        <svg {...common}>
          <circle cx="17" cy="14" r="7" />
          <line x1="6" y1="4" x2="6" y2="24" />
          <line x1="3.5" y1="4" x2="3.5" y2="11" />
          <line x1="8.5" y1="4" x2="8.5" y2="11" />
          <path d="M3.5 11 Q6 13 8.5 11" />
        </svg>
      );
    case 'w9':
      // Document with a tax/seal stamp
      return (
        <svg {...common}>
          <path d="M7 3 H18 L22 7 V25 H7 Z" />
          <path d="M18 3 V7 H22" />
          <circle cx="14.5" cy="16" r="4" />
          <path d="M12.8 16 L14 17.2 L16.3 14.5" strokeWidth="1.3" />
        </svg>
      );
    case 'coi_insurance':
      // Shield with checkmark
      return (
        <svg {...common}>
          <path d="M14 3 L23 6.5 V14 C23 20 19 24 14 25.5 C9 24 5 20 5 14 V6.5 Z" />
          <path d="M10.3 14.2 L13 17 L18 11" strokeWidth="1.5" />
        </svg>
      );
    case 'contact_sheet':
      // Rolodex / contact card
      return (
        <svg {...common}>
          <rect x="4" y="6" width="20" height="15" rx="1.5" />
          <circle cx="10.5" cy="12.5" r="2.2" />
          <path d="M7 18 Q10.5 14.5 14 18" />
          <line x1="17.5" y1="10.5" x2="21" y2="10.5" />
          <line x1="17.5" y1="14" x2="21" y2="14" />
          <line x1="17.5" y1="17.5" x2="20" y2="17.5" />
        </svg>
      );
    case 'bio_one_sheet':
      // Portrait card with text lines
      return (
        <svg {...common}>
          <rect x="4" y="4" width="20" height="20" rx="1.5" />
          <circle cx="10.5" cy="11" r="2.8" />
          <path d="M6.5 17.5 Q10.5 13 14.5 17.5" />
          <line x1="17.5" y1="8" x2="21" y2="8" />
          <line x1="17.5" y1="11" x2="21" y2="11" />
          <line x1="6" y1="21" x2="22" y2="21" opacity="0.5" />
        </svg>
      );
    default:
      // Fallback generic document glyph — should not occur with the 7
      // category keys above, but keeps the grid from breaking if the
      // category set is ever extended without updating this component.
      return (
        <svg {...common}>
          <path d="M7 3 H18 L22 7 V25 H7 Z" />
          <path d="M18 3 V7 H22" />
        </svg>
      );
  }
}


// ─── MediaCard ────────────────────────────────────────────────────────────────

function MediaCard({ item, signedUrl, urlLoading, urlFailed, onDelete, onToggleFeatured }: {
  item: MediaItem;
  signedUrl?: string;
  urlLoading: boolean;
  urlFailed: boolean;
  onDelete: (id: string) => void;
  onToggleFeatured: (id: string, featured: boolean) => void;
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
      <div style={{ width: '100%', paddingBottom: '66%', position: 'relative', background: 'rgba(0,0,0,0.3)' }}>
        {isImage ? (
          urlLoading ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.65rem', color: 'var(--text-muted)', letterSpacing: '0.05em' }}>Loading…</span>
            </div>
          ) : urlFailed ? (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.25rem' }}>
              <span style={{ fontSize: '1.2rem', opacity: 0.5 }}>⚠</span>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.62rem', color: '#f87171', letterSpacing: '0.04em' }}>Unavailable</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={signedUrl}
              alt={item.alt_text || item.file_name}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )
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
        <button
          onClick={() => onToggleFeatured(item.id, !item.is_featured)}
          title={item.is_featured ? 'Remove from EPK' : 'Mark as EPK feature'}
          style={{
            position: 'absolute', top: 6, right: 6,
            background: item.is_featured ? 'var(--accent)' : 'rgba(0,0,0,0.55)',
            border: 'none', borderRadius: '50%',
            width: 26, height: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', fontSize: '0.85rem', lineHeight: 1,
            transition: 'background 0.15s',
            color: item.is_featured ? '#000' : 'rgba(255,255,255,0.7)',
          }}
        >
          {item.is_featured ? '★' : '☆'}
        </button>
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
          {signedUrl ? (
            <a
              href={signedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', textDecoration: 'none' }}
            >
              View
            </a>
          ) : (
            <span
              className="btn btn-ghost btn-sm"
              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', opacity: 0.35, cursor: urlFailed ? 'not-allowed' : 'wait' }}
              title={urlFailed ? 'URL unavailable' : 'Loading…'}
            >
              View
            </span>
          )}

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
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [failedUrlIds, setFailedUrlIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [uploadError, setUploadError] = useState('');
  const [featuredError, setFeaturedError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [altText, setAltText] = useState('');
  const [isPrimaryLogo, setIsPrimaryLogo] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingDocCategory, setPendingDocCategory] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const docFileInputRef = useRef<HTMLInputElement>(null);
  const pendingDocCategoryRef = useRef<string | null>(null);

  // ── Document section state ───────────────────────────────────────────────
  const [docSlots, setDocSlots] = useState<Record<string, DocRow | null>>({});
  const [docHistory, setDocHistory] = useState<Record<string, DocRow[]>>({});
  const [docHistoryOpen, setDocHistoryOpen] = useState<Record<string, boolean>>({});
  const [docsLoading, setDocsLoading] = useState(true);
  const [docFetchingUrl, setDocFetchingUrl] = useState<string | null>(null);
  const [docViewError, setDocViewError] = useState<string | null>(null);
  const [docConfirmDeleteId, setDocConfirmDeleteId] = useState<string | null>(null);
  const [docDeletingId, setDocDeletingId] = useState<string | null>(null);
  const [docDeleteError, setDocDeleteError] = useState<string | null>(null);

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

  // Optional poster fields
  const [showTicketPrice, setShowTicketPrice] = useState(false);
  const [ticketPrice, setTicketPrice] = useState('');
  const [showOpener, setShowOpener] = useState(false);
  const [openerName, setOpenerName] = useState('');
  const [showAgeRestriction, setShowAgeRestriction] = useState(false);
  const [ageRestriction, setAgeRestriction] = useState('');
  const [showTicketUrl, setShowTicketUrl] = useState(false);
  const [ticketUrl, setTicketUrl] = useState('');

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
        .is('document_category', null)
        .order('created_at', { ascending: false });
      const rows = data || [];
      setItems(rows);

      const urlMap: Record<string, string> = {};
      const failedIds = new Set<string>();
      await Promise.all(
        rows.map(async (row) => {
          const res = await fetch(`/api/media/signed-url?id=${row.id}`, {
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
          if (res.ok) {
            const { signedUrl } = await res.json();
            urlMap[row.id] = signedUrl;
          } else {
            failedIds.add(row.id);
          }
        })
      );
      setSignedUrls(urlMap);
      setFailedUrlIds(failedIds);
    } catch (err) {
      console.error('media load:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── Document data ─────────────────────────────────────────────────────────

  const loadDocs = async () => {
    setDocsLoading(true);
    try {
      const { data: rows } = await supabase
        .from('media_library')
        .select('id, file_name, file_size_bytes, created_at, document_category, is_current_version, mime_type')
        .not('document_category', 'is', null)
        .order('created_at', { ascending: false });

      const slots: Record<string, DocRow | null> = {};
      const history: Record<string, DocRow[]> = {};
      for (const cat of DOC_CATEGORIES) {
        slots[cat.key] = null;
        history[cat.key] = [];
      }
      for (const row of rows || []) {
        const cat = row.document_category as string;
        if (!cat) continue;
        if (row.is_current_version) {
          slots[cat] = row as DocRow;
        } else {
          history[cat] = [...(history[cat] || []), row as DocRow];
        }
      }
      setDocSlots(slots);
      setDocHistory(history);
    } catch (err) {
      console.error('docs load:', err);
    } finally {
      setDocsLoading(false);
    }
  };

  useEffect(() => { load(); loadDocs(); }, []);

  // ── Poster section data ───────────────────────────────────────────────────

  useEffect(() => {
    if (!profile?.act_id) return;
    fetchPosterData(profile.act_id);
  }, [profile?.act_id]);

  async function fetchPosterData(actId: string) {
    const { data: bookingRows } = await supabase
      .from('bookings')
      .select('id, show_date, status, venue:venues(name, city, state)')
      .eq('act_id', actId)
      .not('status', 'in', '("cancelled")')
      .not('show_date', 'is', null)
      .order('show_date', { ascending: true });
    setBookings((bookingRows || []) as unknown as Booking[]);

    try {
      const { data: assetRows, error } = await supabase
        .from('media_assets')
        .select('id, file_name, storage_path, mime_type')
        .eq('act_id', actId)
        .eq('category', 'photo')
        .eq('is_featured', true)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error || !assetRows?.length) { setEpkPhotos([]); return; }

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
      setEpkPhotos([]);
    }
  }

  useEffect(() => {
    if (epkPhotos.length > 0 && selectedPhotoId === null) {
      setSelectedPhotoId(epkPhotos[0].id);
    }
  }, [epkPhotos]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => { if (generatedUrlRef.current) URL.revokeObjectURL(generatedUrlRef.current); };
  }, []);

  // ── Poster handlers ───────────────────────────────────────────────────────

  const handleGenerate = async () => {
    if (!posterBookingId) return;
    if (generatedUrlRef.current) { URL.revokeObjectURL(generatedUrlRef.current); generatedUrlRef.current = null; }
    setGeneratedUrl(null); setGeneratedBlob(null); setSaveMsg('');
    setGenerating(true); setGenerateError('');

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
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ bookingId: posterBookingId, style: posterStyle, mediaAssetId: selectedPhotoId || undefined, includedFields }),
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
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  const handleSaveToLibrary = async () => {
    if (!generatedBlob || !profile?.act_id || !user?.id || !posterBookingId) return;
    setSavingToLibrary(true); setSaveMsg('');
    try {
      const fileName = `poster-${posterStyle}-${Date.now()}.png`;
      const storagePath = `${profile.act_id}/${fileName}`;

      const { error: uploadErr } = await supabase.storage
        .from('media-assets')
        .upload(storagePath, generatedBlob, { contentType: 'image/png' });
      if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

      const { data: assetRow, error: assetErr } = await supabase
        .from('media_assets')
        .insert({
          act_id: profile.act_id, uploaded_by: user.id,
          label: `Poster — ${posterStyle} — ${formatShowDate(bookings.find(b => b.id === posterBookingId)?.show_date ?? null)}`,
          category: 'poster', storage_path: storagePath, file_name: fileName,
          file_size: generatedBlob.size, mime_type: 'image/png',
          is_public: false, is_featured: false, width: 1080, height: 1512,
        })
        .select('id').single();
      if (assetErr) throw new Error(`media_assets insert: ${assetErr.message}`);

      const includedFieldsObj: Record<string, string> = {};
      if (showTicketPrice && ticketPrice.trim()) includedFieldsObj.ticketPrice = ticketPrice.trim();
      if (showOpener && openerName.trim())       includedFieldsObj.openerName  = openerName.trim();
      if (showAgeRestriction && ageRestriction.trim()) includedFieldsObj.ageRestriction = ageRestriction.trim();
      if (showTicketUrl && ticketUrl.trim())     includedFieldsObj.ticketUrl   = ticketUrl.trim();

      const { error: posterErr } = await supabase.from('generated_posters').insert({
        act_id: profile.act_id, booking_id: posterBookingId,
        media_asset_id: selectedPhotoId || null, style: posterStyle,
        included_fields: includedFieldsObj,
        output_media_asset_id: assetRow?.id || null, created_by: user.id,
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

  const openModal = (file?: File, documentCategory?: string) => {
    setUploadState('idle');
    setUploadError('');
    setAltText('');
    setIsPrimaryLogo(false);
    setPendingDocCategory(documentCategory ?? null);
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

  // ── Document upload handlers ──────────────────────────────────────────────

  const openDocUpload = (categoryKey: string) => {
    pendingDocCategoryRef.current = categoryKey;
    docFileInputRef.current?.click();
  };

  const handleDocFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const category = pendingDocCategoryRef.current;
    pendingDocCategoryRef.current = null;
    e.target.value = '';
    if (file && category) openModal(file, category);
  };

  const fetchDocSignedUrl = async (rowId: string) => {
    setDocFetchingUrl(rowId);
    setDocViewError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const res = await fetch(`/api/media/signed-url?id=${rowId}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const { signedUrl } = await res.json();
        window.open(signedUrl, '_blank', 'noopener,noreferrer');
      } else {
        setDocViewError('Could not load file — try again');
        setTimeout(() => setDocViewError(null), 3000);
      }
    } catch {
      setDocViewError('Could not load file — try again');
      setTimeout(() => setDocViewError(null), 3000);
    } finally {
      setDocFetchingUrl(null);
    }
  };

  const toggleDocHistory = (category: string) => {
    setDocHistoryOpen(prev => ({ ...prev, [category]: !prev[category] }));
  };

  // Deletes a single media_library row (current slot or a history entry) by id.
  // Works for both because the API resolves bucket from document_category server-side.
  const handleDocDelete = async (rowId: string, category: string) => {
    setDocDeletingId(rowId);
    setDocDeleteError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setDocDeleteError('Not authenticated'); return; }
      const res = await fetch(`/api/media/${rowId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        setDocDeleteError('Could not delete — try again');
        setTimeout(() => setDocDeleteError(null), 3000);
        return;
      }
      // Update whichever bucket (slot or history) this row lived in, locally —
      // avoids a full reload round-trip for a single-row removal.
      setDocSlots(prev => prev[category]?.id === rowId ? { ...prev, [category]: null } : prev);
      setDocHistory(prev => ({
        ...prev,
        [category]: (prev[category] || []).filter(h => h.id !== rowId),
      }));
    } finally {
      setDocDeletingId(null);
      setDocConfirmDeleteId(null);
    }
  };

  const upload = async () => {
    if (!pendingFile) return;
    setUploadState('uploading');
    setUploadError('');
    setUploadProgress(`Uploading ${pendingFile.name}…`);

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { setUploadState('error'); setUploadError('Not authenticated'); return; }

    const fd = new FormData();
    fd.append('file', pendingFile);
    if (altText) fd.append('alt_text', altText);
    if (pendingDocCategory) {
      fd.append('document_category', pendingDocCategory);
    } else if (isPrimaryLogo) {
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

      if (pendingDocCategory) {
        await loadDocs();
      } else {
        const record: MediaItem = await res.json();
        setItems(prev => [record, ...prev]);
        fetch(`/api/media/signed-url?id=${record.id}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).then(r => r.ok ? r.json() : null).then(data => {
          if (data?.signedUrl) setSignedUrls(prev => ({ ...prev, [record.id]: data.signedUrl }));
          else setFailedUrlIds(prev => new Set([...prev, record.id]));
        });
      }

      setUploadState('done');
      setUploadProgress('');
      setTimeout(() => {
        setShowUploadModal(false);
        setPendingFile(null);
        setPendingDocCategory(null);
      }, 800);
    } catch (err: any) {
      setUploadState('error');
      setUploadError(err.message || 'Upload failed');
    }
  };

  const handleDelete = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const handleToggleFeatured = async (id: string, featured: boolean) => {
    const previousFeatured = items.find(i => i.id === id)?.is_featured ?? !featured;
    setItems(cur => cur.map(i => i.id === id ? { ...i, is_featured: featured } : i));
    setFeaturedError(null);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      setItems(cur => cur.map(i => i.id === id ? { ...i, is_featured: previousFeatured } : i));
      return;
    }
    const res = await fetch(`/api/media/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ is_featured: featured }),
    });
    if (!res.ok) {
      setItems(cur => cur.map(i => i.id === id ? { ...i, is_featured: previousFeatured } : i));
      setFeaturedError('Star not saved — try again');
      setTimeout(() => setFeaturedError(null), 3000);
    }
  };

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = filter === 'all' ? items : items.filter(i => i.file_type === filter);

  const typeCounts: Record<string, number> = { all: items.length };
  items.forEach(i => { typeCounts[i.file_type] = (typeCounts[i.file_type] || 0) + 1; });

  const filterTabs = ['all', 'image', 'logo', 'document', 'audio', 'video'].filter(
    t => t === 'all' || (typeCounts[t] || 0) > 0
  );

  const photoCount = items.filter(i => i.mime_type?.startsWith('image/')).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell requireRole="band_admin">
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '2rem 1.5rem' }}>

        {/* ── Media Library ──────────────────────────────────────────────── */}
        <div id="section-media" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
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
          <input ref={docFileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={handleDocFilePick} style={{ display: 'none' }} />
        </div>

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
            <>
              {featuredError && (
                <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#f87171', marginBottom: '0.6rem' }}>
                  {featuredError}
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '1rem' }}>
                {filtered.map(item => (
                  <MediaCard
                    key={item.id}
                    item={item}
                    signedUrl={signedUrls[item.id]}
                    urlLoading={loading || (!signedUrls[item.id] && !failedUrlIds.has(item.id))}
                    urlFailed={failedUrlIds.has(item.id)}
                    onDelete={handleDelete}
                    onToggleFeatured={handleToggleFeatured}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            DOCUMENTS
        ══════════════════════════════════════════════════════════════════ */}
        <div style={{ marginTop: '3.5rem', paddingTop: '2.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', color: 'var(--text-primary)', margin: '0 0 0.25rem', lineHeight: 1 }}>
              DOCUMENTS
            </h2>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Riders, legal docs, and press materials — stored privately
            </div>
          </div>

          {docViewError && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#f87171', marginBottom: '0.75rem' }}>
              ⚠ {docViewError}
            </div>
          )}
          {docDeleteError && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#f87171', marginBottom: '0.75rem' }}>
              ⚠ {docDeleteError}
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>

            {DOC_CATEGORIES.map(cat => {
              const slot = docSlots[cat.key] ?? null;
              const history = docHistory[cat.key] ?? [];
              const historyOpen = !!docHistoryOpen[cat.key];

              return (
                <div key={cat.key} style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.08)',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  padding: '1rem',
                  gap: '0.5rem',
                }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.6rem' }}>
                    <div style={{ flexShrink: 0, marginTop: '0.1rem' }}>
                      <DocCategoryIcon categoryKey={cat.key} />
                    </div>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontSize: '0.78rem',
                      letterSpacing: '0.1em', color: 'var(--accent)',
                      textTransform: 'uppercase', lineHeight: 1.3,
                    }}>
                      {cat.label}
                    </div>
                  </div>

                  {docsLoading ? (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>Loading…</div>
                  ) : slot ? (
                    <>
                      <div style={{ flex: 1 }}>
                        <div style={{
                          fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-primary)',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }} title={slot.file_name}>
                          {slot.file_name}
                        </div>
                        <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          {formatDate(slot.created_at)} · {formatBytes(slot.file_size_bytes)}
                        </div>
                      </div>

                      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                          onClick={() => fetchDocSignedUrl(slot.id)}
                          disabled={docFetchingUrl === slot.id}
                        >
                          {docFetchingUrl === slot.id ? 'Loading…' : 'View'}
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                          onClick={() => openDocUpload(cat.key)}
                          disabled={docConfirmDeleteId === slot.id}
                        >
                          Replace
                        </button>
                        {docConfirmDeleteId !== slot.id ? (
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', color: '#f87171' }}
                            onClick={() => setDocConfirmDeleteId(slot.id)}
                          >
                            Delete
                          </button>
                        ) : (
                          <>
                            <button
                              className="btn btn-sm"
                              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem', background: '#f87171', color: '#000', border: 'none' }}
                              onClick={() => handleDocDelete(slot.id, cat.key)}
                              disabled={docDeletingId === slot.id}
                            >
                              {docDeletingId === slot.id ? 'Deleting…' : 'Confirm'}
                            </button>
                            <button
                              className="btn btn-ghost btn-sm"
                              style={{ fontSize: '0.7rem', padding: '0.2rem 0.5rem' }}
                              onClick={() => setDocConfirmDeleteId(null)}
                              disabled={docDeletingId === slot.id}
                            >
                              Cancel
                            </button>
                          </>
                        )}
                      </div>

                      {history.length > 0 && (
                        <div>
                          <button
                            onClick={() => toggleDocHistory(cat.key)}
                            style={{
                              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
                              fontFamily: 'var(--font-body)', fontSize: '0.68rem',
                              color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.25rem',
                            }}
                          >
                            {historyOpen ? '▲' : '▼'} {history.length} older version{history.length !== 1 ? 's' : ''}
                          </button>
                          {historyOpen && (
                            <div style={{ marginTop: '0.4rem', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                              {history.map(h => (
                                <div key={h.id} style={{
                                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                  padding: '0.3rem 0.5rem', background: 'rgba(0,0,0,0.2)', borderRadius: 4, gap: '0.4rem',
                                }}>
                                  <span style={{
                                    fontFamily: 'var(--font-body)', fontSize: '0.67rem', color: 'var(--text-muted)',
                                    flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                  }}>
                                    {formatDate(h.created_at)}
                                  </span>
                                  <button
                                    className="btn btn-ghost btn-sm"
                                    style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', flexShrink: 0 }}
                                    onClick={() => fetchDocSignedUrl(h.id)}
                                    disabled={docFetchingUrl === h.id}
                                  >
                                    {docFetchingUrl === h.id ? '…' : 'View'}
                                  </button>
                                  {docConfirmDeleteId !== h.id ? (
                                    <button
                                      className="btn btn-ghost btn-sm"
                                      style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', flexShrink: 0, color: '#f87171' }}
                                      onClick={() => setDocConfirmDeleteId(h.id)}
                                    >
                                      Delete
                                    </button>
                                  ) : (
                                    <>
                                      <button
                                        className="btn btn-sm"
                                        style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', flexShrink: 0, background: '#f87171', color: '#000', border: 'none' }}
                                        onClick={() => handleDocDelete(h.id, cat.key)}
                                        disabled={docDeletingId === h.id}
                                      >
                                        {docDeletingId === h.id ? '…' : 'Confirm'}
                                      </button>
                                      <button
                                        className="btn btn-ghost btn-sm"
                                        style={{ fontSize: '0.65rem', padding: '0.1rem 0.4rem', flexShrink: 0 }}
                                        onClick={() => setDocConfirmDeleteId(null)}
                                        disabled={docDeletingId === h.id}
                                      >
                                        ✕
                                      </button>
                                    </>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
                        No {cat.label.toLowerCase()} uploaded yet
                      </div>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ fontSize: '0.72rem', padding: '0.25rem 0.6rem', alignSelf: 'flex-start' }}
                        onClick={() => openDocUpload(cat.key)}
                      >
                        + Upload
                      </button>
                    </>
                  )}
                </div>
              );
            })}

            {/* Press Photos shortcut */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(255,255,255,0.12)',
              borderRadius: 8, display: 'flex', flexDirection: 'column', padding: '1rem', gap: '0.5rem',
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.78rem', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', lineHeight: 1.2 }}>
                Press Photos
              </div>
              <div style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                {loading ? 'Loading…' : photoCount > 0
                  ? `${photoCount} photo${photoCount !== 1 ? 's' : ''} in Media Library`
                  : 'No photos uploaded yet'}
              </div>
              <a href="#section-media" style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--accent)', textDecoration: 'none', alignSelf: 'flex-start' }}>
                ↑ Go to Media Library
              </a>
            </div>

            {/* Show Posters shortcut */}
            <div style={{
              background: 'rgba(255,255,255,0.02)',
              border: '1px dashed rgba(255,255,255,0.12)',
              borderRadius: 8, display: 'flex', flexDirection: 'column', padding: '1rem', gap: '0.5rem',
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '0.78rem', letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', lineHeight: 1.2 }}>
                Show Posters
              </div>
              <div style={{ flex: 1, fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Generate 1080 × 1512 px show posters
              </div>
              <a href="#section-posters" style={{ fontFamily: 'var(--font-body)', fontSize: '0.72rem', color: 'var(--accent)', textDecoration: 'none', alignSelf: 'flex-start' }}>
                ↑ Go to Posters
              </a>
            </div>

          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            SHOW POSTERS
        ══════════════════════════════════════════════════════════════════ */}
        <div id="section-posters" style={{ marginTop: '3.5rem', paddingTop: '2.5rem', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '1.9rem', color: 'var(--text-primary)', margin: '0 0 0.25rem', lineHeight: 1 }}>
              SHOW POSTERS
            </h2>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
              Generate 1080 × 1512 px PNG posters for your shows
            </div>
          </div>

          <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>

            <div style={{ flex: '1 1 360px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

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

              <div className="field">
                <label className="field-label">
                  Photo
                  <span style={{ fontWeight: 400, color: 'var(--text-muted)', marginLeft: '0.4rem' }}>(EPK-marked photos)</span>
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
                            flexShrink: 0, width: 76, height: 76, padding: 0,
                            border: selectedPhotoId === photo.id ? '2px solid var(--accent)' : '2px solid rgba(255,255,255,0.12)',
                            borderRadius: 6, overflow: 'hidden', cursor: 'pointer',
                            background: 'rgba(0,0,0,0.3)', transition: 'border-color 0.15s',
                            outline: selectedPhotoId === photo.id ? '2px solid rgba(200,146,26,0.4)' : 'none',
                            outlineOffset: 1,
                          }}
                        >
                          {photo.thumbnailUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={photo.thumbnailUrl} alt={photo.file_name} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.65rem', fontFamily: 'var(--font-body)' }}>img</div>
                          )}
                        </button>
                      ))}
                    </div>
                    {selectedPhotoId && (
                      <button className="btn btn-ghost btn-sm" onClick={() => setSelectedPhotoId(null)} style={{ fontSize: '0.7rem', alignSelf: 'flex-start', padding: '0.15rem 0.5rem' }}>
                        Use no photo
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="field">
                <label className="field-label">Optional fields</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[
                    { show: showTicketPrice, setShow: setShowTicketPrice, label: 'Ticket price / door cover', value: ticketPrice, setValue: setTicketPrice, placeholder: 'e.g. $15 advance · $20 door', type: 'text' },
                    { show: showOpener, setShow: setShowOpener, label: 'Opener / support act', value: openerName, setValue: setOpenerName, placeholder: 'e.g. The Desert Sons', type: 'text' },
                    { show: showAgeRestriction, setShow: setShowAgeRestriction, label: 'Age restriction', value: ageRestriction, setValue: setAgeRestriction, placeholder: 'e.g. 21+ · All ages', type: 'text' },
                  ].map(({ show, setShow, label, value, setValue, placeholder, type }) => (
                    <div key={label} style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer' }}>
                        <input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />
                        <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>{label}</span>
                      </label>
                      {show && <input className="input" type={type} placeholder={placeholder} value={value} onChange={e => setValue(e.target.value)} style={{ marginLeft: '1.4rem' }} />}
                    </div>
                  ))}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', cursor: 'pointer' }}>
                      <input type="checkbox" checked={showTicketUrl} onChange={e => setShowTicketUrl(e.target.checked)} />
                      <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                        Ticket link{' '}<span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>(generates QR code)</span>
                      </span>
                    </label>
                    {showTicketUrl && <input className="input" type="url" placeholder="https://..." value={ticketUrl} onChange={e => setTicketUrl(e.target.value)} style={{ marginLeft: '1.4rem' }} />}
                  </div>
                </div>
              </div>

              {generateError && <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: '#f87171' }}>{generateError}</div>}

              <button className="btn btn-primary" onClick={handleGenerate} disabled={!posterBookingId || generating}>
                {generating ? 'Generating…' : 'Generate Poster'}
              </button>
            </div>

            <div style={{ flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{
                position: 'relative', width: '100%', paddingBottom: `${(1512 / 1080) * 100}%`,
                border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8,
                overflow: 'hidden', background: 'rgba(0,0,0,0.25)',
              }}>
                <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {generating ? (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-muted)' }}>Generating…</div>
                  ) : generatedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={generatedUrl} alt="Generated poster preview" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <div style={{ fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', padding: '1.5rem', lineHeight: 1.6 }}>
                      Select a show and click<br />Generate Poster
                    </div>
                  )}
                </div>
              </div>

              {generatedUrl && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <button className="btn btn-ghost btn-sm" onClick={handleDownload} style={{ fontSize: '0.78rem' }}>↓ Download PNG</button>
                  <button
                    className="btn btn-sm" onClick={handleSaveToLibrary} disabled={savingToLibrary}
                    style={{ fontSize: '0.78rem', background: 'var(--accent)', color: '#000', border: 'none', opacity: savingToLibrary ? 0.6 : 1 }}
                  >
                    {savingToLibrary ? 'Saving…' : 'Save to Library'}
                  </button>
                  {saveMsg && (
                    <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.73rem', color: saveMsg.startsWith('Error') ? '#f87171' : '#4ade80' }}>
                      {saveMsg}
                    </span>
                  )}
                </div>
              )}
            </div>

          </div>
        </div>

      </div>

      {/* ── Upload Modal ───────────────────────────────────────────────────── */}
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
              {pendingDocCategory ? 'UPLOAD DOCUMENT' : 'UPLOAD FILE'}
            </div>

            {pendingDocCategory && (
              <div style={{
                fontFamily: 'var(--font-body)', fontSize: '0.78rem', color: 'var(--text-muted)',
                background: 'rgba(200,146,26,0.08)', border: '1px solid rgba(200,146,26,0.2)',
                padding: '0.45rem 0.7rem', borderRadius: 5,
              }}>
                Category: <span style={{ color: 'var(--accent)' }}>
                  {DOC_CATEGORIES.find(c => c.key === pendingDocCategory)?.label ?? pendingDocCategory}
                </span>
              </div>
            )}

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

            {!pendingDocCategory && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: '0.82rem', color: 'var(--text-primary)' }}>
                <input
                  type="checkbox"
                  checked={isPrimaryLogo}
                  onChange={e => setIsPrimaryLogo(e.target.checked)}
                  disabled={uploadState === 'uploading'}
                />
                Set as primary act logo
              </label>
            )}

            {uploadState === 'error' && (
              <div style={{ color: '#f87171', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>{uploadError}</div>
            )}
            {uploadState === 'uploading' && (
              <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>{uploadProgress}</div>
            )}
            {uploadState === 'done' && (
              <div style={{ color: '#4ade80', fontFamily: 'var(--font-body)', fontSize: '0.78rem' }}>Uploaded successfully.</div>
            )}

            <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end' }}>
              <button
                className="btn btn-ghost"
                onClick={() => { setShowUploadModal(false); setPendingFile(null); setPendingDocCategory(null); }}
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