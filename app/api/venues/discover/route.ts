import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface Location {
  city: string;
  state: string;
}

interface GoogleGeocodeResult {
  status: string;
  results: Array<{
    geometry: {
      location: {
        lat: number;
        lng: number;
      };
    };
  }>;
  error_message?: string;
}

interface GooglePlacesSearchResult {
  results: Array<{
    place_id: string;
    name: string;
  }>;
}

interface GooglePlaceDetailsResponse {
  result: {
    place_id: string;
    name: string;
    formatted_address: string;
    formatted_phone_number?: string;
    website?: string;
    rating?: number;
    types: string[];
    url?: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Extract authenticated user from Authorization: Bearer <token>
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: authUser }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const userId: string = authUser.id;

    const body = await request.json();
    const { locations, radius }: { locations: Location[]; radius: number } = body;

    if (!locations || locations.length === 0) {
      return NextResponse.json({ error: 'No locations provided' }, { status: 400 });
    }

    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!googleApiKey) {
      return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 });
    }

    let totalVenuesFound = 0;
    const radiusMeters = radius * 1609.34; // Convert miles to meters

    // Process each location
    for (const location of locations) {
      const { city, state } = location;

      // Step 1: Geocode the city to get coordinates
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        `${city}, ${state}`
      )}&key=${googleApiKey}`;

      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData: GoogleGeocodeResult = await geocodeResponse.json();

      if (geocodeData.status !== 'OK') {
        console.error(`Geocoding failed for ${city}, ${state}. Status: ${geocodeData.status}, Error: ${geocodeData.error_message || 'Unknown'}`);
        continue;
      }

      if (!geocodeData.results || geocodeData.results.length === 0) {
        console.error(`Could not geocode ${city}, ${state}. No results returned.`);
        continue;
      }

      const coordinates = geocodeData.results[0].geometry.location;

      // Step 2: Search for live music venues
      const searchQueries = [
        'bar',
        'live music',
        'music venue',
        'nightclub'
      ];

      for (const query of searchQueries) {
        try {
          const searchResponse = await fetch(
            `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
              query
            )}&location=${coordinates.lat},${coordinates.lng}&radius=${radiusMeters}&type=bar|night_club&key=${googleApiKey}`
          );

          const searchData: GooglePlacesSearchResult = await searchResponse.json();

          if (!searchData.results || searchData.results.length === 0) {
            continue;
          }

          // Process each venue (limit to 5 per query to avoid quota issues)
          const placesToProcess = searchData.results.slice(0, 5);

          for (const place of placesToProcess) {
            try {
              const detailsResponse = await fetch(
                `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=place_id,name,formatted_address,formatted_phone_number,website,rating,types,url&key=${googleApiKey}`
              );

              const detailsData: GooglePlaceDetailsResponse = await detailsResponse.json();
              const details = detailsData.result;

              if (!details) continue;

              // Parse address to extract city and state
              const addressParts = details.formatted_address.split(',').map(p => p.trim());
              let venueCity = city;
              let venueState = state;

              if (addressParts.length >= 3) {
                venueCity = addressParts[addressParts.length - 3];
                const stateZip = addressParts[addressParts.length - 2];
                venueState = stateZip.split(' ')[0];
              }

              const venueType = determineVenueType(details.name, details.types.join(' '));

              // Check if venue already exists
              const { data: existingVenue } = await supabase
                .from('venues')
                .select('id')
                .ilike('name', details.name)
                .ilike('city', venueCity)
                .limit(1)
                .single();

              if (existingVenue) {
                continue;
              }

              const { error: insertError } = await supabase.from('venues').insert([
                {
                  name: details.name,
                  address: details.formatted_address,
                  city: venueCity,
                  state: venueState,
                  phone: details.formatted_phone_number,
                  website: details.website,
                  venue_type: venueType,
                  contact_status: 'not_contacted',
                  notes: `Found via Google Places. Rating: ${details.rating || 'N/A'}. Google Maps: ${details.url || 'N/A'}`,
                  user_id: userId
                }
              ]);

              if (insertError) {
                console.error('Error inserting venue:', insertError);
                continue;
              }

              console.log(`Successfully added venue: ${details.name} in ${venueCity}, ${venueState}`);
              totalVenuesFound++;

              // Rate limiting - delay between API calls
              await delay(300);
            } catch (error) {
              console.error(`Error processing place ${place.name}:`, error);
            }
          }

          // Delay between search queries
          await delay(500);
        } catch (error) {
          console.error(`Error searching for "${query}":`, error);
        }
      }
    }

    return NextResponse.json({
      success: true,
      venuesFound: totalVenuesFound,
      message: `Discovered ${totalVenuesFound} new venues`
    });
  } catch (error) {
    console.error('Venue discovery error:', error);
    return NextResponse.json({
      error: 'Venue discovery failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}

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
