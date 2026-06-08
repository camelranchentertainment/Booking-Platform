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
  'application/pdf': 'document',
  'audio/mpeg':    'audio',
  'audio/wav':     'audio',
  'video/mp4':     'video',
  'video/quicktime': 'video',
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

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
  const fileType = ALLOWED_TYPES[mimeType];

  if (!fileType) {
    return res.status(400).json({ error: `Unsupported file type: ${mimeType}` });
  }

  const isPrimaryLogo = fields.is_primary_logo?.[0] === 'true'
    || fields.file_type?.[0] === 'logo';

  const ext = path.extname(file.originalFilename || '').toLowerCase() || '.bin';
  const storagePath = `${profile.act_id}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;

  const fileBuffer = fs.readFileSync(file.filepath);

  const { error: uploadError } = await service.storage
    .from('media-library')
    .upload(storagePath, fileBuffer, { contentType: mimeType, upsert: false });

  if (uploadError) {
    return res.status(500).json({ error: uploadError.message });
  }

  const { data: urlData } = service.storage
    .from('media-library')
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

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
    // Clean up uploaded file if DB insert fails
    await service.storage.from('media-library').remove([storagePath]);
    return res.status(500).json({ error: dbError.message });
  }

  // Update act logo_url if this is primary logo
  if (isPrimaryLogo) {
    await service
      .from('acts')
      .update({ logo_url: publicUrl })
      .eq('id', profile.act_id);
  }

  return res.status(201).json(record);
}
