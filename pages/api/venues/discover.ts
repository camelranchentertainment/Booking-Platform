import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface Location { city: string; state: string; }

interface GoogleGeocodeResult {
  status: string;
  results: Array<{ geometry: { location: { lat: number; lng: number } } }>;
  error_message?: string;
}

interface GooglePlacesSearchResult {
  results: Array<{ place_id: string; name: string }>;
}

interface GooglePlaceDetailsResponse {
  result: {
    place_id: string; name: string; formatted_address: string;
    formatted_phone_number?: string; website?: string;
    rating?: number; types: string[]; url?: string;
  };
}

function determineVenueType(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();
  if (text.includes('dancehall')) return 'dancehall';
  if (text.includes('honky tonk') || text.includes('honkytonk')) return 'saloon';
  if (text.includes('saloon')) return 'saloon';
  if (text.includes('pub') || text.includes('tavern')) return 'pub';
  if (text.includes('music hall') || text.includes('nightclub') || text.includes('club')) return 'club';
  return 'bar';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authUser) return res.status(401).json({ error: 'Unauthorized' });
  const userId: string = authUser.id;

  const { locations, radius }: { locations: Location[]; radius: number } = req.body;
  if (!locations || locations.length === 0) return res.status(400).json({ error: 'No locations provided' });

  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!googleApiKey) return res.status(500).json({ error: 'Google Places API key not configured' });

  let totalVenuesFound = 0;
  const radiusMeters = radius * 1609.34;

  for (const { city, state } of locations) {
    const geocodeResponse = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(`${city}, ${state}`)}&key=${googleApiKey}`
    );
    const geocodeData: GoogleGeocodeResult = await geocodeResponse.json();
    if (geocodeData.status !== 'OK' || !geocodeData.results?.[0]) continue;

    const coords = geocodeData.results[0].geometry.location;

    for (const query of ['bar', 'live music', 'music venue', 'nightclub']) {
      try {
        const searchResponse = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${coords.lat},${coords.lng}&radius=${radiusMeters}&type=bar|night_club&key=${googleApiKey}`
        );
        const searchData: GooglePlacesSearchResult = await searchResponse.json();
        if (!searchData.results?.length) continue;

        for (const place of searchData.results.slice(0, 5)) {
          try {
            const detailsResponse = await fetch(
              `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=place_id,name,formatted_address,formatted_phone_number,website,rating,types,url&key=${googleApiKey}`
            );
            const { result: details }: GooglePlaceDetailsResponse = await detailsResponse.json();
            if (!details) continue;

            const addressParts = details.formatted_address.split(',').map(p => p.trim());
            let venueCity = city;
            let venueState = state;
            if (addressParts.length >= 3) {
              venueCity = addressParts[addressParts.length - 3];
              venueState = addressParts[addressParts.length - 2].split(' ')[0];
            }

            const { data: existing } = await supabase
              .from('venues').select('id')
              .ilike('name', details.name).ilike('city', venueCity)
              .limit(1).maybeSingle();
            if (existing) continue;

            const { error: insertError } = await supabase.from('venues').insert([{
              name: details.name, address: details.formatted_address,
              city: venueCity, state: venueState,
              phone: details.formatted_phone_number, website: details.website,
              venue_type: determineVenueType(details.name, details.types.join(' ')),
              contact_status: 'not_contacted',
              notes: `Found via Google Places. Rating: ${details.rating || 'N/A'}.`,
              user_id: userId,
            }]);

            if (!insertError) totalVenuesFound++;
            await delay(300);
          } catch { /* skip malformed place */ }
        }
        await delay(500);
      } catch (err) {
        console.error(`Error searching for "${query}":`, err);
      }
    }
  }

  return res.status(200).json({
    success: true,
    venuesFound: totalVenuesFound,
    message: `Discovered ${totalVenuesFound} new venues`,
  });
}
