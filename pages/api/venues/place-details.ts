import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { place_id } = req.query;
  if (!place_id || typeof place_id !== 'string') return res.status(400).json({ error: 'place_id required' });

  const apiKey = (await getSetting('google_maps_server_key')) || (await getSetting('google_maps_api_key'));
  if (!apiKey) return res.status(501).json({ error: 'Google Maps not configured' });

  const fields = 'website,formatted_phone_number,name';
  const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(place_id)}&fields=${fields}&key=${apiKey}`;

  const gRes = await fetch(url);
  const gData = await gRes.json();

  if (gData.status !== 'OK') {
    return res.status(502).json({ error: `Google error: ${gData.status}` });
  }

  return res.status(200).json({
    website: gData.result?.website || null,
    phone:   gData.result?.formatted_phone_number || null,
    name:    gData.result?.name || null,
  });
}
