import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  const campaignId = req.query.id as string;

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !authUser) return res.status(401).json({ error: 'Unauthorized' });
  const userId = authUser.id;

  const { data: campaign, error: campaignError } = await supabase
    .from('campaigns')
    .select('id, cities, radius, user_id')
    .eq('id', campaignId)
    .single();

  if (campaignError || !campaign) return res.status(404).json({ error: 'Campaign not found' });

  const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!googleApiKey) return res.status(500).json({ error: 'Google Places API key not configured' });

  const radiusMeters = (campaign.radius ?? 25) * 1609.34;
  let newVenuesCount = 0;

  for (const cityState of (campaign.cities || [])) {
    const parts = cityState.split(',').map((p: string) => p.trim());
    if (parts.length !== 2) continue;
    const [city, state] = parts;

    const geocodeResponse = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(`${city}, ${state}`)}&key=${googleApiKey}`
    );
    const geocodeData = await geocodeResponse.json();
    if (geocodeData.status !== 'OK' || !geocodeData.results?.[0]) continue;

    const coordinates = geocodeData.results[0].geometry.location;

    for (const query of ['bar', 'live music', 'music venue', 'nightclub']) {
      const searchResponse = await fetch(
        `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(query)}&location=${coordinates.lat},${coordinates.lng}&radius=${radiusMeters}&type=bar|night_club&key=${googleApiKey}`
      );
      const searchData = await searchResponse.json();
      if (!searchData.results?.length) continue;

      for (const place of searchData.results.slice(0, 5)) {
        try {
          const detailsResponse = await fetch(
            `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=place_id,name,formatted_address,formatted_phone_number,website,rating,types,url&key=${googleApiKey}`
          );
          const { result: details } = await detailsResponse.json();
          if (!details) continue;

          const addressParts = details.formatted_address.split(',').map((p: string) => p.trim());
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

          if (!insertError) newVenuesCount++;
          await delay(300);
        } catch { /* skip malformed place */ }
      }
      await delay(500);
    }
  }

  const cityFilters = (campaign.cities || [])
    .map((cs: string) => {
      const parts = cs.split(',').map((p: string) => p.trim());
      return parts.length === 2 ? { city: parts[0], state: parts[1] } : null;
    })
    .filter(Boolean) as { city: string; state: string }[];

  const { data: allUserVenues } = await supabase.from('venues').select('*').eq('user_id', userId);
  const venues = (allUserVenues || []).filter(v =>
    cityFilters.some(f =>
      v.city?.toLowerCase() === f.city.toLowerCase() &&
      v.state?.toLowerCase() === f.state.toLowerCase()
    )
  );

  const { data: campaignVenues } = await supabase
    .from('campaign_venues').select('venue_id').eq('campaign_id', campaignId);
  const existingIds = new Set((campaignVenues || []).map(cv => cv.venue_id));

  return res.status(200).json({
    success: true,
    newVenuesDiscovered: newVenuesCount,
    totalVenues: venues.length,
    venues: venues.map(v => ({ ...v, in_campaign: existingIds.has(v.id) })),
  });
}
