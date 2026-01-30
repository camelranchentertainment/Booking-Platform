import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

interface Location {
  city: string;
  state: string;
}

interface DiscoverVenuesRequest {
  locations: Location[];
  radius: number;
}

interface GooglePlaceResult {
  place_id: string;
  name: string;
  formatted_address: string;
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
  types: string[];
  url?: string;
  geometry?: {
    location: {
      lat: number;
      lng: number;
    };
  };
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
  result: GooglePlaceResult;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { locations, radius }: DiscoverVenuesRequest = req.body;

    if (!locations || locations.length === 0) {
      return res.status(400).json({ error: 'No locations provided' });
    }

    const googleApiKey = 'AIzaSyAaWb5krK4mP9x7UERojP3tTVdLRlNxuKs';
    if (!googleApiKey) {
      return res.status(500).json({ error: 'Google Places API key not configured' });
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
      
      console.log(`Geocoding: ${city}, ${state}`);
      const geocodeResponse = await fetch(geocodeUrl);

      const geocodeData: GoogleGeocodeResult = await geocodeResponse.json();
      
      console.log(`Geocode response for ${city}:`, JSON.stringify(geocodeData));

      // Check for API errors
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
        'live music bar',
        'live music venue',
        'country music venue',
        'bar with live music',
        'saloon',
        'dancehall',
        'honky tonk'
      ];

      for (const query of searchQueries) {
        try {
          // Text Search
          const searchResponse = await fetch(
            `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
              query
            )}&location=${coordinates.lat},${coordinates.lng}&radius=${radiusMeters}&type=bar|night_club&key=${googleApiKey}`
          );

          const searchData: GooglePlacesSearchResult = await searchResponse.json();

          if (!searchData.results || searchData.results.length === 0) {
            continue;
          }

          // Process each venue
          for (const place of searchData.results) {
            try {
              // Get detailed place information
              const detailsResponse = await fetch(
                `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=place_id,name,formatted_address,formatted_phone_number,website,rating,types,url&key=${googleApiKey}`
              );

              const detailsData: GooglePlaceDetailsResponse = await detailsResponse.json();
              const details: GooglePlaceResult = detailsData.result;

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

              // Determine venue type
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
                console.log(`Venue already exists: ${details.name}`);
                continue;
              }

              // Get user_id from session or use a default
              // Note: In production, you should get this from auth
              let userId: string | null = null;
              const authHeader = req.headers.authorization;
              if (authHeader) {
                const token = authHeader.replace('Bearer ', '');
                const { data: { user } } = await supabase.auth.getUser(token);
                userId = user?.id || null; // Convert undefined to null
              }

              // Insert new venue
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

    return res.status(200).json({
      success: true,
      venuesFound: totalVenuesFound,
      message: `Discovered ${totalVenuesFound} new venues`
    });
  } catch (error) {
    console.error('Venue discovery error:', error);
    return res.status(500).json({
      error: 'Venue discovery failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

function determineVenueType(name: string, description: string): string {
  const text = `${name} ${description}`.toLowerCase();

  if (text.includes('dancehall')) return 'dancehall';
  if (text.includes('honky tonk') || text.includes('honkytonk')) return 'honky_tonk';
  if (text.includes('saloon')) return 'saloon';
  if (text.includes('pub') || text.includes('tavern')) return 'pub';
  if (text.includes('music hall')) return 'music_hall';
  if (text.includes('club') || text.includes('nightclub')) return 'club';
  if (text.includes('bar') || text.includes('grill')) return 'bar';

  return 'venue';
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
