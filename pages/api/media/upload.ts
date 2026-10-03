import { NextApiRequest, NextApiResponse } from 'next';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';
import { getServiceClient } from '../../../lib/supabase';

export const config = { api: { bodyParser: false } };

const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg':    'image',
  'image/jpg':     'image',
  'image/png':     'image',
  'image/gif':     'image',
  'image/webp':    'image',
  'image/svg+xml': 'image',
  'application/pdf':      'document',
  'application/msword':   'document',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'audio/mpeg':    'audio',
  'audio/wav':     'audio',
  'video/mp4':     'video',
  'video/quicktime': 'video',
};

const VALID_DOCUMENT_CATEGORIES = new Set([
  'stage_plot_input_list',
  'technical_rider',
  'hospitality_rider',
  'w9',
  'coi_insurance',
  'contact_sheet',
  'bio_one_sheet',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

// Public bucket + prefix that holds the published copy of each act's primary logo.
export const PUBLIC_LOGO_BUCKET = 'avatars';
export const PUBLIC_LOGO_PREFIX = 'act-logos';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await service
    .from('profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.act_id) return res.status(400).json({ error: 'No act linked to account' });
  if (!['band_admin', 'superadmin'].includes(profile.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const form = formidable({ maxFileSize: MAX_FILE_SIZE });

  let fields: formidable.Fields;
  let files: formidable.Files;
  try {
    [fields, files] = await form.parse(req);
  } catch (err: any) {
    return res.status(400).json({ error: err.message || 'Failed to parse upload' });
  }

  const fileArray = files.file;
  if (!fileArray || fileArray.length === 0) {
    return res.status(400).json({ error: 'No file provided' });
  }

  const file = fileArray[0];
  const mimeType = file.mimetype || 'application/octet-stream';

  if (!ALLOWED_TYPES[mimeType]) {
    return res.status(400).json({ error: `Unsupported file type: ${mimeType}` });
  }

  // Validate document_category if provided — never trust the client value blindly
  const rawCategory = fields.document_category?.[0] ?? null;
  if (rawCategory !== null && !VALID_DOCUMENT_CATEGORIES.has(rawCategory)) {
    return res.status(400).json({ error: `Invalid document_category: ${rawCategory}` });
  }
  const documentCategory = rawCategory; // null | one of the 7 valid values
  const isDocument = documentCategory !== null;

  const ext = path.extname(file.originalFilename || '').toLowerCase() || '.bin';
  const storagePath = `${profile.act_id}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  const bucket = isDocument ? 'band-documents' : 'media-library';

  const fileBuffer = fs.readFileSync(file.filepath);

  const { error: uploadError } = await service.storage
    .from(bucket)
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    return res.status(500).json({ error: uploadError.message });
  }

  // ── Document path ──────────────────────────────────────────────────────────
  // band-documents is a private bucket — no public URL exists or should be exposed.
  //
  // Transaction note: the Supabase JS client has no BEGIN/COMMIT API; true atomicity
  // requires an RPC. We INSERT first so a failed INSERT leaves no orphaned state.
  // A failed UPDATE after a successful INSERT leaves two is_current_version=true rows
  // for this category (recoverable) rather than zero (silent data loss).
  if (isDocument) {
    const { data: record, error: dbError } = await service
      .from('media_library')
      .insert({
        act_id:             profile.act_id,
        uploaded_by:        user.id,
        file_name:          file.originalFilename || storagePath,
        storage_path:       storagePath,
        public_url:         null,
        file_type:          'document',
        mime_type:          mimeType,
        file_size_bytes:    file.size,
        alt_text:           fields.alt_text?.[0] || null,
        is_primary_logo:    false,
        tags:               null,
        document_category:  documentCategory,
        is_current_version: true,
      })
      .select()
      .single();

    if (dbError) {
      await service.storage.from(bucket).remove([storagePath]);
      return res.status(500).json({ error: dbError.message });
    }

    // Retire previous versions for this category (safe to fail — UI can show both)
    await service
      .from('media_library')
      .update({ is_current_version: false })
      .eq('act_id', profile.act_id)
      .eq('document_category', documentCategory)
      .neq('id', record.id);

    return res.status(201).json(record);
  }

  // ── Non-document path (existing behaviour, unchanged) ─────────────────────

  const isPrimaryLogo = fields.is_primary_logo?.[0] === 'true'
    || fields.file_type?.[0] === 'logo';

  // media-library is a PRIVATE bucket (phase14 migration), so getPublicUrl()
  // on it yields a URL that storage refuses to serve. Non-logo media is shown
  // in-app via signed URLs. The primary logo, however, is rendered on public
  // pages (ArtistSpotlight, /api/public/acts) and must be publicly reachable,
  // so we publish a copy of it to the public `avatars` bucket and point
  // acts.logo_url at that copy. The private original remains the source of truth.
  let publicUrl: string;
  let publicLogoPath: string | null = null;

  if (isPrimaryLogo) {
    if (!mimeType.startsWith('image/')) {
      await service.storage.from('media-library').remove([storagePath]);
      return res.status(400).json({ error: 'Act logo must be an image (PNG, JPG, SVG, GIF or WebP)' });
    }
    publicLogoPath = `${PUBLIC_LOGO_PREFIX}/${profile.act_id}/${Date.now()}${ext}`;
    const { error: publishError } = await service.storage
      .from(PUBLIC_LOGO_BUCKET)
      .upload(publicLogoPath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
        cacheControl: '31536000', // path is unique per upload, safe to cache long
      });
    if (publishError) {
      console.error('[media/upload] failed to publish logo copy', {
        actId: profile.act_id, error: publishError.message,
      });
      await service.storage.from('media-library').remove([storagePath]);
      return res.status(500).json({ error: `Could not publish logo: ${publishError.message}` });
    }
    publicUrl = service.storage.from(PUBLIC_LOGO_BUCKET).getPublicUrl(publicLogoPath).data.publicUrl;
  } else {
    publicUrl = service.storage.from('media-library').getPublicUrl(storagePath).data.publicUrl;
  }

  // Clear previous primary logo for this act before inserting new one
  if (isPrimaryLogo) {
    await service
      .from('media_library')
      .update({ is_primary_logo: false })
      .eq('act_id', profile.act_id)
      .eq('is_primary_logo', true);
  }

  const mediaFileType = isPrimaryLogo
    ? 'logo'
    : mimeType.startsWith('image/')
    ? 'photo'
    : mimeType === 'application/pdf'
    ? 'press'
    : 'other';

  const { data: record, error: dbError } = await service
    .from('media_library')
    .insert({
      act_id:           profile.act_id,
      uploaded_by:      user.id,
      file_name:        file.originalFilename || storagePath,
      storage_path:     storagePath,
      public_url:       publicUrl,
      file_type:        mediaFileType,
      mime_type:        mimeType,
      file_size_bytes:  file.size,
      alt_text:         fields.alt_text?.[0] || null,
      is_primary_logo:  isPrimaryLogo,
      tags:             null,
    })
    .select()
    .single();

  if (dbError) {
    await service.storage.from('media-library').remove([storagePath]);
    if (publicLogoPath) await service.storage.from(PUBLIC_LOGO_BUCKET).remove([publicLogoPath]);
    return res.status(500).json({ error: dbError.message });
  }

  if (isPrimaryLogo && publicLogoPath) {
    const { error: actError } = await service
      .from('acts')
      .update({ logo_url: publicUrl })
      .eq('id', profile.act_id);
    if (actError) {
      console.error('[media/upload] failed to set acts.logo_url', {
        actId: profile.act_id, error: actError.message,
      });
      return res.status(500).json({ error: `Logo uploaded but could not be set on the act: ${actError.message}` });
    }
    await removeStalePublicLogos(service, profile.act_id, publicLogoPath);
  }

  return res.status(201).json(record);
}

/**
 * Deletes earlier published logo copies for an act so the public bucket holds
 * only the current one. Best-effort: a failure leaves orphaned files, never a
 * broken logo, so it is logged rather than surfaced to the user.
 */
async function removeStalePublicLogos(
  service: ReturnType<typeof getServiceClient>,
  actId: string,
  keepPath: string,
): Promise<void> {
  const folder = `${PUBLIC_LOGO_PREFIX}/${actId}`;
  const { data: existing, error } = await service.storage.from(PUBLIC_LOGO_BUCKET).list(folder);
  if (error) {
    console.warn('[media/upload] could not list old logos', { actId, error: error.message });
    return;
  }
  const stale = (existing ?? [])
    .map(o => `${folder}/${o.name}`)
    .filter(p => p !== keepPath);
  if (stale.length === 0) return;
  const { error: rmError } = await service.storage.from(PUBLIC_LOGO_BUCKET).remove(stale);
  if (rmError) console.warn('[media/upload] could not remove old logos', { actId, error: rmError.message });
}
