import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Valid venue types per database CHECK constraint:
// 'bar' | 'saloon' | 'pub' | 'club' | 'dancehall'
function determineVenueType(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();
  if (text.includes('dancehall')) return 'dancehall';
  if (text.includes('honky tonk') || text.includes('honkytonk')) return 'saloon';
  if (text.includes('saloon')) return 'saloon';
  if (text.includes('pub') || text.includes('tavern')) return 'pub';
  if (text.includes('music hall') || text.includes('nightclub') || text.includes('club')) return 'club';
  if (text.includes('bar') || text.includes('grill')) return 'bar';
  return 'bar';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: campaignId } = await params;

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Require a valid Supabase user token
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId = authUser.id;

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, cities, radius, user_id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!googleApiKey) {
      return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 });
    }

    const radiusMeters = (campaign.radius ?? 25) * 1609.34;
    let newVenuesCount = 0;

    // Process each city in the campaign
    for (const cityState of (campaign.cities || [])) {
      const parts = cityState.split(',').map((p: string) => p.trim());
      if (parts.length !== 2) continue;

      const [city, state] = parts;

      const geocodeResponse = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(`${city}, ${state}`)}&key=${googleApiKey}`
      );
      const geocodeData = await geocodeResponse.json();

      if (geocodeData.status !== 'OK' || !geocodeData.results?.[0]) {
        console.error(`Geocoding failed for ${city}, ${state}: ${geocodeData.status}`);
        continue;
      }

      const coordinates = geocodeData.results[0].geometry.location;
      const searchQueries = ['bar', 'live music', 'music venue', 'nightclub'];

      for (const query of searchQueries) {
        const searchResponse = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
            query
          )}&location=${coordinates.lat},${coordinates.lng}&radius=${radiusMeters}&type=bar|night_club&key=${googleApiKey}`
        );
        const searchData = await searchResponse.json();

        if (!searchData.results?.length) continue;

        for (const place of searchData.results.slice(0, 5)) {
          try {
            const detailsResponse = await fetch(
              `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=place_id,name,formatted_address,formatted_phone_number,website,rating,types,url&key=${googleApiKey}`
            );
            const detailsData = await detailsResponse.json();
            const details = detailsData.result;
            if (!details) continue;

            const addressParts = details.formatted_address.split(',').map((p: string) => p.trim());
            let venueCity = city;
            let venueState = state;
            if (addressParts.length >= 3) {
              venueCity = addressParts[addressParts.length - 3];
              venueState = addressParts[addressParts.length - 2].split(' ')[0];
            }

            const venueType = determineVenueType(details.name, details.types.join(' '));

            const { data: existingVenue } = await supabase
              .from('venues')
              .select('id')
              .ilike('name', details.name)
              .ilike('city', venueCity)
              .limit(1)
              .single();

            if (existingVenue) continue;

            const { error: insertError } = await supabase.from('venues').insert([{
              name: details.name,
              address: details.formatted_address,
              city: venueCity,
              state: venueState,
              phone: details.formatted_phone_number,
              website: details.website,
              venue_type: venueType,
              contact_status: 'not_contacted',
              notes: `Found via Google Places. Rating: ${details.rating || 'N/A'}. Google Maps: ${details.url || 'N/A'}`,
              user_id: userId,
            }]);

            if (insertError) {
              console.error('Error inserting venue:', insertError);
              continue;
            }

            newVenuesCount++;
            await delay(300);
          } catch (err) {
            console.error('Error processing place:', err);
          }
        }

        await delay(500);
      }
    }

    // Return all venues in campaign cities, marked with in_campaign flag
    const cityFilters = (campaign.cities || [])
      .map((cs: string) => {
        const parts = cs.split(',').map((p: string) => p.trim());
        return parts.length === 2 ? { city: parts[0], state: parts[1] } : null;
      })
      .filter(Boolean) as { city: string; state: string }[];

    const { data: allUserVenues, error: venuesError } = await supabase
      .from('venues')
      .select('*')
      .eq('user_id', userId);

    if (venuesError) {
      return NextResponse.json({ error: 'Failed to fetch venues' }, { status: 500 });
    }

    const venues = (allUserVenues || []).filter(venue =>
      cityFilters.some(f =>
        venue.city?.toLowerCase() === f.city.toLowerCase() &&
        venue.state?.toLowerCase() === f.state.toLowerCase()
      )
    );

    const { data: campaignVenues } = await supabase
      .from('campaign_venues')
      .select('venue_id')
      .eq('campaign_id', campaignId);

    const existingVenueIds = new Set((campaignVenues || []).map(cv => cv.venue_id));

    return NextResponse.json({
      success: true,
      newVenuesDiscovered: newVenuesCount,
      totalVenues: venues.length,
      venues: venues.map(venue => ({ ...venue, in_campaign: existingVenueIds.has(venue.id) })),
    });

  } catch (error: unknown) {
    console.error('Campaign venue discovery error:', error);
    return NextResponse.json({
      error: 'Campaign venue discovery failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    }, { status: 500 });
  }
}
