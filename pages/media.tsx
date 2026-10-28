// pages/media.tsx
//
// Media — the band's photos and files, the documents venues ask for, and show
// posters, in the Tours style: an illustrated header, a "ready to send" strip
// (photos, documents on file, posters), then one section at a time.
//
// Band admins only. media_library rows are read with the caller's session
// (RLS scopes them to the band); files sit in private buckets and are shown
// through short-lived signed URLs from /api/media/signed-url.

import { useState, useEffect, useRef, useCallback } from 'react';
import AppShell from '../components/layout/AppShell';
import PageHero from '../components/layout/PageHero';
import FilmStripScene from '../components/media/FilmStripScene';
import { supabase } from '../lib/supabase';
import { useRequireAuth } from '../lib/hooks/useRequireAuth';
import { localToday, parseLocalDate } from '../lib/formatDate';
import styles from '../styles/media.module.css';

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
  is_featured: boolean;
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
  poster:   'Poster',
};

type Section = 'library' | 'documents' | 'posters';

const POSTER_STYLES: Array<{ key: 'americana' | 'electric' | 'western'; label: string; note: string; swatch: string }> = [
  { key: 'americana', label: 'Americana', note: 'Deep sepia tones · gold frame · Bebas Neue headline', swatch: 'swAmericana' },
  { key: 'electric',  label: 'Electric',  note: 'Full-bleed photo · dark/orange gradient · high contrast', swatch: 'swElectric' },
  { key: 'western',   label: 'Western',   note: 'Nested border frame · desaturated photo · Playfair serif', swatch: 'swWestern' },
];

function formatBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function formatShowDate(dateStr: string | null): string {
  if (!dateStr) return 'Date TBD';
  return parseLocalDate(dateStr).toLocaleDateString('en-US', {
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
  const [deleteError, setDeleteError] = useState(false);

  const isImage = item.mime_type.startsWith('image/');

  const handleDelete = async () => {
    setDeleting(true);
    setDeleteError(false);
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
      setDeleteError(true);
    }
  };

  return (
    <article className={styles.card}>
      <div className={`${styles.thumb} ${item.file_type === 'poster' ? styles.thumbPoster : ''}`}>
        {isImage ? (
          urlLoading ? (
            <div className={`${styles.thumbState} tour-skeleton`}><span>Loading…</span></div>
          ) : urlFailed ? (
            <div className={`${styles.thumbState} ${styles.thumbFail}`}><span aria-hidden="true">⚠</span><span>Preview unavailable</span></div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={signedUrl} alt={item.alt_text || item.file_name} loading="lazy" />
          )
        ) : (
          <div className={styles.thumbIcon} aria-hidden="true">
            {item.file_type === 'document' ? 'PDF' : item.file_type === 'audio' ? '♫' : item.file_type === 'video' ? '▶' : '?'}
          </div>
        )}
        {item.is_primary_logo && <span className={styles.badge}>Logo</span>}
        <button
          type="button"
          className={`${styles.star} ${item.is_featured ? styles.starOn : ''}`}
          onClick={() => onToggleFeatured(item.id, !item.is_featured)}
          aria-pressed={item.is_featured}
          aria-label={item.is_featured ? `Remove ${item.file_name} from your press kit` : `Feature ${item.file_name} in your press kit`}
          title={item.is_featured ? 'Featured in your press kit' : 'Feature in your press kit'}
        >
          <span aria-hidden="true">{item.is_featured ? '★' : '☆'}</span>
        </button>
      </div>

      <div className={styles.cardBody}>
        <span className={styles.cardName} title={item.file_name}>{item.file_name}</span>
        <span className={styles.cardMeta}>{FILE_TYPE_LABELS[item.file_type] || item.file_type} · {formatBytes(item.file_size_bytes)}</span>
        {deleteError && <span className={styles.alert} role="alert">Couldn&apos;t delete. Try again.</span>}
        <div className={styles.cardActions}>
          {signedUrl ? (
            <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">View</a>
          ) : (
            <span className="btn btn-secondary" aria-disabled="true" style={{ opacity: 0.4 }}>View</span>
          )}
          {!confirmDelete ? (
            <button type="button" className={`btn btn-secondary ${styles.danger}`} onClick={() => setConfirmDelete(true)}>Delete</button>
          ) : (
            <>
              <button type="button" className={`btn ${styles.dangerFill}`} onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting…' : 'Delete it'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>Keep</button>
            </>
          )}
        </div>
      </div>
    </article>
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
      // Posters are for shows that are on the books and still to come —
      // not pitches, holds or shows already played.
      .in('status', ['contract', 'confirmed', 'advancing'])
      .gte('show_date', localToday())
      .order('show_date', { ascending: true });
    setBookings((bookingRows || []) as unknown as Booking[]);

    try {
      const { data: assetRows, error } = await supabase
        .from('media_library')
        .select('id, file_name, storage_path, mime_type, is_featured')
        .eq('act_id', actId)
        .like('mime_type', 'image/%')
        .is('document_category', null)
        .order('created_at', { ascending: false });

      if (error) { setEpkPhotos([]); return; }

      const paths = (assetRows || []).map(r => r.storage_path).filter(Boolean);
      let signedMap: Record<string, string> = {};
      if (paths.length > 0) {
        const { data: signed } = await supabase.storage
          .from('media-library')
          .createSignedUrls(paths, 3600);
        (signed || []).forEach(s => { if (s.signedUrl && s.path) signedMap[s.path] = s.signedUrl; });
      }

      const sorted = [...(assetRows || [])].sort((a, b) =>
        (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0)
      );
      setEpkPhotos(
        sorted.map(r => ({
          id:           r.id,
          file_name:    r.file_name,
          storage_path: r.storage_path,
          mime_type:    r.mime_type,
          is_featured:  r.is_featured ?? false,
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
        .from('media-library')
        .upload(storagePath, generatedBlob, { contentType: 'image/png' });
      if (uploadErr) throw new Error(`Storage upload: ${uploadErr.message}`);

      // media-library is a private bucket — no public_url; the grid and EPK
      // picker resolve display URLs on demand via /api/media/signed-url.
      const { data: assetRow, error: assetErr } = await supabase
        .from('media_library')
        .insert({
          act_id: profile.act_id, uploaded_by: user.id,
          file_name: `Poster — ${posterStyle} — ${formatShowDate(bookings.find(b => b.id === posterBookingId)?.show_date ?? null)}.png`,
          file_type: 'poster', storage_path: storagePath, public_url: null,
          file_size_bytes: generatedBlob.size, mime_type: 'image/png',
          is_featured: false, width_px: 1080, height_px: 1512,
        })
        .select('id').single();
      if (assetErr) throw new Error(`media_library insert: ${assetErr.message}`);

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

      setSaveMsg('Saved to your library ✓');
      void load();
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

  const filterTabs = ['all', 'image', 'poster', 'logo', 'document', 'audio', 'video'].filter(
    t => t === 'all' || (typeCounts[t] || 0) > 0
  );

  const photoCount = items.filter(i => i.mime_type?.startsWith('image/') && i.file_type !== 'poster').length;
  const posterCount = items.filter(i => i.file_type === 'poster').length;
  const featuredCount = items.filter(i => i.is_featured).length;
  const docsOnFile = DOC_CATEGORIES.filter(c => docSlots[c.key]).length;

  // ── Upload dialog (native <dialog>: focus trap, Esc, backdrop) ───────────
  const uploadDialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = uploadDialogRef.current;
    if (!d) return;
    if (showUploadModal && !d.open) d.showModal();
    if (!showUploadModal && d.open) d.close();
  }, [showUploadModal]);
  const closeUpload = () => {
    if (uploadState === 'uploading') return;
    setShowUploadModal(false);
    setPendingFile(null);
    setPendingDocCategory(null);
  };

  const [section, setSection] = useState<Section>('library');
  const posterStyleInfo = POSTER_STYLES.find(p => p.key === posterStyle);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AppShell requireRole="band_admin">
      <div className={styles.page}>
        <PageHero
          title="Media"
          subtitle="Photos, documents & show posters"
          summary={loading ? undefined : `${photoCount} ${photoCount === 1 ? 'photo' : 'photos'} · ${docsOnFile} of ${DOC_CATEGORIES.length} documents on file · ${posterCount} ${posterCount === 1 ? 'poster' : 'posters'}.`}
          scene={<FilmStripScene />}
          actions={<button type="button" className="btn btn-primary" onClick={() => fileInputRef.current?.click()}>+ Upload</button>}
        />
        <input ref={fileInputRef} type="file" accept="image/*,.pdf,audio/*,video/*" onChange={handleFilePick} hidden />
        <input ref={docFileInputRef} type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" onChange={handleDocFilePick} hidden />

        {/* Ready-to-send strip — doubles as the section switcher */}
        <div className={styles.ready} role="group" aria-label="Media sections">
          <button type="button" className={styles.readyCard} aria-pressed={section === 'library'} onClick={() => setSection('library')}
            style={section === 'library' ? { borderColor: 'var(--accent)' } : undefined}>
            <span className={styles.readyLabel}>Photos &amp; files</span>
            <span className={styles.readyValue}>{loading ? '–' : items.length}<small>{featuredCount ? `${featuredCount} ★ featured` : 'files'}</small></span>
            <span className={styles.readyNote}>Press photos, logos, audio and video</span>
          </button>
          <button type="button" className={styles.readyCard} aria-pressed={section === 'documents'} onClick={() => setSection('documents')}
            style={section === 'documents' ? { borderColor: 'var(--accent)' } : undefined}>
            <span className={styles.readyLabel}>Documents</span>
            <span className={styles.readyValue}>{docsLoading ? '–' : docsOnFile}<small>of {DOC_CATEGORIES.length} on file</small></span>
            <div className="tour-meter" aria-hidden="true"><div className={`tour-meter-bar${docsOnFile === DOC_CATEGORIES.length ? ' tour-meter-bar--done' : ''}`} style={{ width: `${(docsOnFile / DOC_CATEGORIES.length) * 100}%` }} /></div>
          </button>
          <button type="button" className={styles.readyCard} aria-pressed={section === 'posters'} onClick={() => setSection('posters')}
            style={section === 'posters' ? { borderColor: 'var(--accent)' } : undefined}>
            <span className={styles.readyLabel}>Show posters</span>
            <span className={styles.readyValue}>{bookings.length}<small>{bookings.length === 1 ? 'show' : 'shows'} to promote</small></span>
            <span className={styles.readyNote}>Make a 1080 × 1512 poster in one click</span>
          </button>
        </div>

        {/* ── Photos & files ── */}
        {section === 'library' && (
          <section id="section-media" aria-labelledby="media-lib" className={styles.page} style={{ gap: '1rem' }}>
            <div className={styles.sectionHead}>
              <div>
                <h2 id="media-lib" className={styles.sectionTitle}>Photos &amp; files</h2>
                <p className={styles.sectionSub}>Star the photos you want in your press kit and on posters. Drag files anywhere here to upload.</p>
              </div>
              {filterTabs.length > 1 && (
                <div className={styles.chips} role="group" aria-label="Filter by type">
                  {filterTabs.map(t => (
                    <button key={t} type="button" className={`${styles.chip} ${filter === t ? styles.chipOn : ''}`} aria-pressed={filter === t} onClick={() => setFilter(t)}>
                      {t === 'all' ? 'All' : (FILE_TYPE_LABELS[t] || t)} <span>{typeCounts[t] || 0}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {featuredError && <p className={styles.alert} role="alert">{featuredError}</p>}

            <div className={`${styles.drop} ${dragOver ? styles.dropOver : ''}`} onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
              {loading ? (
                <div className={styles.grid}>{Array.from({ length: 4 }, (_, i) => <div key={i} className="tour-skeleton" style={{ aspectRatio: '3 / 2.4', borderRadius: 'var(--radius-sm)' }} />)}</div>
              ) : filtered.length === 0 ? (
                <button type="button" className={styles.emptyDrop} onClick={() => fileInputRef.current?.click()}>
                  <span className={styles.emptyPlus} aria-hidden="true">+</span>
                  {filter !== 'all' ? `No ${(FILE_TYPE_LABELS[filter] || filter).toLowerCase()} files yet.` : 'Drop photos here, or click to upload your first one.'}
                </button>
              ) : (
                <div className={styles.grid}>
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
              )}
            </div>
          </section>
        )}

        {/* ── Documents ── */}
        {section === 'documents' && (
          <section aria-labelledby="media-docs" className={styles.page} style={{ gap: '1rem' }}>
            <div className={styles.sectionHead}>
              <div>
                <h2 id="media-docs" className={styles.sectionTitle}>Documents</h2>
                <p className={styles.sectionSub}>The paperwork venues ask for: riders, W-9, insurance and your one-sheet. Stored privately.</p>
              </div>
              <div className={styles.docMeter}>
                <strong>{docsOnFile} of {DOC_CATEGORIES.length}</strong> ready
                <div className="tour-meter" aria-hidden="true"><div className={`tour-meter-bar${docsOnFile === DOC_CATEGORIES.length ? ' tour-meter-bar--done' : ''}`} style={{ width: `${(docsOnFile / DOC_CATEGORIES.length) * 100}%` }} /></div>
              </div>
            </div>

            {docViewError && <p className={styles.alert} role="alert">{docViewError}</p>}
            {docDeleteError && <p className={styles.alert} role="alert">{docDeleteError}</p>}

            <div className={styles.docs}>
              {DOC_CATEGORIES.map(cat => {
                const slot = docSlots[cat.key] ?? null;
                const history = docHistory[cat.key] ?? [];
                const historyOpen = !!docHistoryOpen[cat.key];
                return (
                  <article key={cat.key} className={`${styles.doc} ${docsLoading ? '' : slot ? styles.docReady : styles.docMissing}`} aria-labelledby={`doc-${cat.key}`}>
                    <div className={styles.docHead}>
                      <DocCategoryIcon categoryKey={cat.key} />
                      <h3 id={`doc-${cat.key}`} className={styles.docTitle}>{cat.label}</h3>
                      {!docsLoading && (
                        <span className={`${styles.docStatus} ${slot ? styles.docStatusOk : styles.docStatusMissing}`}>{slot ? 'On file' : 'Missing'}</span>
                      )}
                    </div>

                    {docsLoading ? (
                      <div className="tour-skeleton" style={{ height: '3rem', borderRadius: 6 }} />
                    ) : slot ? (
                      <>
                        <div>
                          <div className={styles.docFile} title={slot.file_name}>{slot.file_name}</div>
                          <div className={styles.docMeta}>{formatDate(slot.created_at)} · {formatBytes(slot.file_size_bytes)}</div>
                        </div>
                        <div className={styles.docActions}>
                          <button type="button" className="btn btn-secondary" onClick={() => fetchDocSignedUrl(slot.id)} disabled={docFetchingUrl === slot.id}>
                            {docFetchingUrl === slot.id ? 'Opening…' : 'View'}
                          </button>
                          <button type="button" className="btn btn-secondary" onClick={() => openDocUpload(cat.key)} disabled={docConfirmDeleteId === slot.id}>Replace</button>
                          {docConfirmDeleteId !== slot.id ? (
                            <button type="button" className={`btn btn-secondary ${styles.danger}`} onClick={() => setDocConfirmDeleteId(slot.id)}>Delete</button>
                          ) : (
                            <>
                              <button type="button" className={`btn ${styles.dangerFill}`} onClick={() => handleDocDelete(slot.id, cat.key)} disabled={docDeletingId === slot.id}>
                                {docDeletingId === slot.id ? 'Deleting…' : 'Delete it'}
                              </button>
                              <button type="button" className="btn btn-secondary" onClick={() => setDocConfirmDeleteId(null)} disabled={docDeletingId === slot.id}>Keep</button>
                            </>
                          )}
                        </div>
                        {history.length > 0 && (
                          <div>
                            <button type="button" className={styles.historyToggle} aria-expanded={historyOpen} onClick={() => toggleDocHistory(cat.key)}>
                              {historyOpen ? '▲' : '▼'} {history.length} older version{history.length !== 1 ? 's' : ''}
                            </button>
                            {historyOpen && (
                              <ul className={styles.historyList}>
                                {history.map(h => (
                                  <li key={h.id} className={styles.historyRow}>
                                    <span>{formatDate(h.created_at)}</span>
                                    <button type="button" className="btn btn-secondary" onClick={() => fetchDocSignedUrl(h.id)} disabled={docFetchingUrl === h.id}>
                                      {docFetchingUrl === h.id ? '…' : 'View'}
                                    </button>
                                    {docConfirmDeleteId !== h.id ? (
                                      <button type="button" className={`btn btn-secondary ${styles.danger}`} onClick={() => setDocConfirmDeleteId(h.id)} aria-label={`Delete version from ${formatDate(h.created_at)}`}>Delete</button>
                                    ) : (
                                      <>
                                        <button type="button" className={`btn ${styles.dangerFill}`} onClick={() => handleDocDelete(h.id, cat.key)} disabled={docDeletingId === h.id}>
                                          {docDeletingId === h.id ? '…' : 'Delete it'}
                                        </button>
                                        <button type="button" className="btn btn-secondary" onClick={() => setDocConfirmDeleteId(null)} disabled={docDeletingId === h.id} aria-label="Keep this version">Keep</button>
                                      </>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <p className={styles.docEmpty}>Not uploaded yet.</p>
                        <div className={styles.docActions}>
                          <button type="button" className="btn btn-primary" onClick={() => openDocUpload(cat.key)}>+ Upload</button>
                        </div>
                      </>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Show posters ── */}
        {section === 'posters' && (
          <section id="section-posters" aria-labelledby="media-posters" className={styles.page} style={{ gap: '1rem' }}>
            <div className={styles.sectionHead}>
              <div>
                <h2 id="media-posters" className={styles.sectionTitle}>Show posters</h2>
                <p className={styles.sectionSub}>Pick a show, a style and a photo. You get a 1080 × 1512 PNG ready for Instagram and the venue&apos;s socials.</p>
              </div>
            </div>

            <div className={styles.posterGrid}>
              <div className={styles.panel}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>Show</span>
                  <select className="select" value={posterBookingId} onChange={e => { setPosterBookingId(e.target.value); setSaveMsg(''); }}>
                    <option value="">Select a show…</option>
                    {bookings.map(b => {
                      const label = [b.venue?.name, b.venue?.city].filter(Boolean).join(', ');
                      return <option key={b.id} value={b.id}>{label || 'Unnamed venue'} · {formatShowDate(b.show_date)}</option>;
                    })}
                  </select>
                  {bookings.length === 0 && <p className={styles.fieldHint}>No upcoming shows on the books yet. Confirmed shows show up here.</p>}
                </label>

                <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className={styles.fieldLabel} style={{ marginBottom: '0.4rem' }}>Style</legend>
                  <div className={styles.styles3}>
                    {POSTER_STYLES.map(p => (
                      <button key={p.key} type="button" className={`${styles.styleBtn} ${posterStyle === p.key ? styles.styleOn : ''}`} aria-pressed={posterStyle === p.key} onClick={() => setPosterStyle(p.key)}>
                        <span className={`${styles.styleSwatch} ${styles[p.swatch]}`} aria-hidden="true" />
                        <span className={styles.styleName}>{p.label}</span>
                      </button>
                    ))}
                  </div>
                  {posterStyleInfo && <p className={styles.fieldHint}>{posterStyleInfo.note}</p>}
                </fieldset>

                <div className={styles.field}>
                  <span className={styles.fieldLabel} id="poster-photo">Photo<span>(★ starred first)</span></span>
                  {epkPhotos.length === 0 ? (
                    <p className={styles.fieldHint}>No photos yet. <button type="button" className="btn btn-secondary" onClick={() => setSection('library')}>Upload photos</button></p>
                  ) : (
                    <>
                      <div className={styles.photos} role="group" aria-labelledby="poster-photo">
                        {epkPhotos.map(photo => (
                          <button key={photo.id} type="button" className={`${styles.photoBtn} ${selectedPhotoId === photo.id ? styles.photoOn : ''}`}
                            onClick={() => setSelectedPhotoId(photo.id)} aria-pressed={selectedPhotoId === photo.id} aria-label={photo.file_name} title={photo.file_name}>
                            {photo.thumbnailUrl
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={photo.thumbnailUrl} alt="" loading="lazy" />
                              : <span className={styles.photoNone}>img</span>}
                            {photo.is_featured && <span className={styles.photoStar} aria-hidden="true">★</span>}
                          </button>
                        ))}
                      </div>
                      {selectedPhotoId && (
                        <button type="button" className="btn btn-secondary" style={{ alignSelf: 'flex-start' }} onClick={() => setSelectedPhotoId(null)}>Use no photo</button>
                      )}
                    </>
                  )}
                </div>

                <fieldset className={styles.field} style={{ border: 0, padding: 0, margin: 0 }}>
                  <legend className={styles.fieldLabel} style={{ marginBottom: '0.4rem' }}>Add to the poster</legend>
                  {[
                    { show: showTicketPrice, setShow: setShowTicketPrice, label: 'Ticket price / door cover', value: ticketPrice, setValue: setTicketPrice, placeholder: 'e.g. $15 advance · $20 door', type: 'text' },
                    { show: showOpener, setShow: setShowOpener, label: 'Opener / support act', value: openerName, setValue: setOpenerName, placeholder: 'e.g. The Desert Sons', type: 'text' },
                    { show: showAgeRestriction, setShow: setShowAgeRestriction, label: 'Age restriction', value: ageRestriction, setValue: setAgeRestriction, placeholder: 'e.g. 21+ · All ages', type: 'text' },
                    { show: showTicketUrl, setShow: setShowTicketUrl, label: 'Ticket link (adds a QR code)', value: ticketUrl, setValue: setTicketUrl, placeholder: 'https://…', type: 'url' },
                  ].map(({ show, setShow, label, value, setValue, placeholder, type }) => (
                    <div key={label} className={styles.option}>
                      <label><input type="checkbox" checked={show} onChange={e => setShow(e.target.checked)} />{label}</label>
                      {show && <input className="input" type={type} placeholder={placeholder} value={value} aria-label={label} onChange={e => setValue(e.target.value)} />}
                    </div>
                  ))}
                </fieldset>

                {generateError && <p className={styles.alert} role="alert">{generateError}</p>}
                <button type="button" className="btn btn-primary" onClick={handleGenerate} disabled={!posterBookingId || generating}>
                  {generating ? 'Making your poster…' : 'Make poster'}
                </button>
              </div>

              <div className={styles.panel}>
                <div className={styles.preview} aria-live="polite" aria-busy={generating}>
                  {generating ? (
                    <div className={`${styles.previewEmpty} tour-skeleton`}><strong>Printing…</strong>This takes a few seconds.</div>
                  ) : generatedUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={generatedUrl} alt="Your poster preview" />
                  ) : (
                    <div className={styles.previewEmpty}><strong>Your poster</strong>Pick a show and press Make poster.</div>
                  )}
                </div>
                {generatedUrl && (
                  <div className={styles.previewActions}>
                    <button type="button" className="btn btn-secondary" onClick={handleDownload}>↓ Download PNG</button>
                    <button type="button" className="btn btn-primary" onClick={handleSaveToLibrary} disabled={savingToLibrary}>
                      {savingToLibrary ? 'Saving…' : 'Save to library'}
                    </button>
                    {saveMsg && <span className={saveMsg.startsWith('Error') ? styles.alert : styles.ok} role="status">{saveMsg}</span>}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}
      </div>

      {/* ── Upload dialog ── */}
      <dialog ref={uploadDialogRef} className={styles.dialog} aria-labelledby="upload-title"
        onCancel={e => { e.preventDefault(); closeUpload(); }}>
        <div className={styles.dialogBody}>
          <h2 id="upload-title" className={styles.dialogTitle}>{pendingDocCategory ? 'Upload document' : 'Upload file'}</h2>

          {pendingDocCategory && (
            <div className={styles.dialogTag}>For: <strong>{DOC_CATEGORIES.find(c => c.key === pendingDocCategory)?.label ?? pendingDocCategory}</strong></div>
          )}

          {pendingFile ? (
            <div className={styles.dialogFile}><strong>{pendingFile.name}</strong> · {formatBytes(pendingFile.size)}</div>
          ) : (
            <button type="button" className={styles.dialogPick} onClick={() => fileInputRef.current?.click()}>Choose a file</button>
          )}

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Description <span>(optional, read aloud by screen readers)</span></span>
            <input className="input" value={altText} onChange={e => setAltText(e.target.value)} disabled={uploadState === 'uploading'} />
          </label>

          {!pendingDocCategory && (
            <label className={styles.check}>
              <input type="checkbox" checked={isPrimaryLogo} onChange={e => setIsPrimaryLogo(e.target.checked)} disabled={uploadState === 'uploading'} />
              Use as the band&apos;s main logo
            </label>
          )}

          {uploadState === 'error' && <p className={styles.alert} role="alert">{uploadError}</p>}
          {uploadState === 'uploading' && <p className={styles.progress} role="status">{uploadProgress}</p>}
          {uploadState === 'done' && <p className={styles.ok} role="status">Uploaded.</p>}

          <div className={styles.dialogActions}>
            <button type="button" className="btn btn-secondary" onClick={closeUpload} disabled={uploadState === 'uploading'}>Cancel</button>
            <button type="button" className="btn btn-primary" onClick={upload} disabled={!pendingFile || uploadState === 'uploading' || uploadState === 'done'}>
              {uploadState === 'uploading' ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      </dialog>
    </AppShell>
  );
}
