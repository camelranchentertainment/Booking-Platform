import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!['DELETE', 'PATCH'].includes(req.method || '')) return res.status(405).end();

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

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing id' });

  const { data: record } = await service
    .from('media_library')
    .select('id, act_id, storage_path, is_primary_logo, document_category')
    .eq('id', id)
    .maybeSingle();

  if (!record) return res.status(404).json({ error: 'Not found' });
  if (record.act_id !== profile.act_id) return res.status(403).json({ error: 'Forbidden' });

  if (req.method === 'PATCH') {
    const { is_featured } = req.body as { is_featured?: boolean };
    if (typeof is_featured !== 'boolean') {
      return res.status(400).json({ error: 'is_featured must be boolean' });
    }

    const { data: updated, error } = await service
      .from('media_library')
      .update({ is_featured })
      .eq('id', id)
      .select('id, is_featured')
      .single();

    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json(updated);
  }

  // DELETE
  // Documents live in the private `band-documents` bucket; everything else
  // (photos, logos, posters) lives in `media-library`. Always deleting from
  // `media-library` regardless of category orphaned document files in storage.
  const bucket = record.document_category ? 'band-documents' : 'media-library';
  await service.storage.from(bucket).remove([record.storage_path]);
  await service.from('media_library').delete().eq('id', id);

  if (record.is_primary_logo) {
    await service.from('acts').update({ logo_url: null }).eq('id', profile.act_id);
  }

  return res.status(200).json({ ok: true });
}
