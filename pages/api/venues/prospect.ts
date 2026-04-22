import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

// Google Places Text Search — finds real venues in a city/state
// Returns results annotated with whether they're already in the agent's database

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { city, state } = req.query;
  if (!city || !state) return res.status(400).json({ error: 'city and state required' });

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  if (!apiKey || apiKey === 'YOUR_GOOGLE_MAPS_API_KEY') {
    return res.status(501).json({ error: 'Google Maps API key not configured. Add NEXT_PUBLIC_GOOGLE_MAPS_API_KEY to your environment variables.' });
  }

  try {
    // Search Google Places for music venues, bars, clubs in this city
    const query = encodeURIComponent(`music venues bars nightclubs live music ${city} ${state}`);
    const url = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}&key=${apiKey}`;

    const gRes = await fetch(url);
    const gData = await gRes.json();

    if (gData.status !== 'OK' && gData.status !== 'ZERO_RESULTS') {
      return res.status(502).json({ error: `Google Places error: ${gData.status}` });
    }

    const places = (gData.results || []).slice(0, 20);

    // Get the agent's existing venues in this city to mark duplicates
    const cityStr = String(city).toLowerCase();
    const { data: existing } = await service
      .from('venues')
      .select('id, name, place_id')
      .ilike('city', `%${cityStr}%`);

    const existingPlaceIds = new Set((existing || []).map((v: any) => v.place_id).filter(Boolean));
    const existingNames    = new Set((existing || []).map((v: any) => v.name.toLowerCase()));

    const results = places.map((p: any) => {
      // Extract city and state from address_components if available, else parse formatted_address
      const formatted: string = p.formatted_address || '';
      const parts = formatted.split(',').map((s: string) => s.trim());

      return {
        place_id:          p.place_id,
        name:              p.name,
        address:           parts[0] || '',
        city:              String(city),
        state:             String(state),
        formatted_address: formatted,
        rating:            p.rating || null,
        user_ratings_total: p.user_ratings_total || 0,
        types:             p.types || [],
        google_maps_url:   `https://www.google.com/maps/place/?q=place_id:${p.place_id}`,
        already_added:     existingPlaceIds.has(p.place_id) || existingNames.has(p.name.toLowerCase()),
      };
    });

    return res.status(200).json(results);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
