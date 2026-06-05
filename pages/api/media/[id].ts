import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).end();

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
    .select('id, act_id, storage_path, is_primary_logo')
    .eq('id', id)
    .maybeSingle();

  if (!record) return res.status(404).json({ error: 'Not found' });
  if (record.act_id !== profile.act_id) return res.status(403).json({ error: 'Forbidden' });

  // Remove from storage
  await service.storage.from('media-library').remove([record.storage_path]);

  // Remove DB record
  await service.from('media_library').delete().eq('id', id);

  // If this was the primary logo, clear acts.logo_url
  if (record.is_primary_logo) {
    await service.from('acts').update({ logo_url: null }).eq('id', profile.act_id);
  }

  return res.status(200).json({ ok: true });
}
