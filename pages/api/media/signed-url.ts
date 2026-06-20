import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await service
    .from('profiles')
    .select('act_id')
    .eq('id', user.id)
    .single();

  if (!profile?.act_id) return res.status(400).json({ error: 'No act linked to account' });

  const { id } = req.query;
  if (!id || typeof id !== 'string') return res.status(400).json({ error: 'Missing id' });

  const { data: record } = await service
    .from('media_library')
    .select('id, act_id, storage_path')
    .eq('id', id)
    .maybeSingle();

  if (!record) return res.status(404).json({ error: 'Not found' });
  if (record.act_id !== profile.act_id) return res.status(403).json({ error: 'Forbidden' });

  const { data: signed, error } = await service.storage
    .from('media-library')
    .createSignedUrl(record.storage_path, 300); // 5-minute TTL

  if (error || !signed) {
    return res.status(500).json({ error: error?.message || 'Failed to create signed URL' });
  }

  return res.status(200).json({ signedUrl: signed.signedUrl });
}
