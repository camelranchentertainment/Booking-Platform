import { NextApiRequest, NextApiResponse } from 'next';
import { getSetting } from '../../../lib/platformSettings';

// Returns non-secret public configuration needed by client-side components.
// The Maps API key is not a server secret — it's already embedded in
// script URLs and should be restricted by HTTP referrer in Google Console.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).end();

  const mapsKey = await getSetting('google_maps_api_key');

  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.json({
    googleMapsApiKey: mapsKey || '',
  });
}
