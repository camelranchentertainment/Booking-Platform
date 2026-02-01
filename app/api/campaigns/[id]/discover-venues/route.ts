import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

interface Campaign {
  id: string;
  cities: string[];
  radius: number;
  user_id: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  console.log('=== CAMPAIGN VENUE DISCOVERY API CALLED ===');
  
  try {
    // Await params in Next.js 16+
    const { id: campaignId } = await params;
    console.log('Campaign ID:', campaignId);
    
    // Create Supabase client with SERVICE ROLE KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase credentials');
      return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
    }
    
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    console.log('Supabase client created');

    // Get campaign details
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, cities, radius, user_id')
      .eq('id', campaignId)
      .single();

    if (campaignError || !campaign) {
      console.error('Campaign not found:', campaignError);
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    console.log('Campaign found:', campaign);

    // Step 1: Run venue discovery for each city
    console.log('Starting venue discovery...');
    
    const googleApiKey = process.env.GOOGLE_PLACES_API_KEY;
    if (!googleApiKey) {
      console.error('Google API key not configured');
      return NextResponse.json({ error: 'Google Places API key not configured' }, { status: 500 });
    }

    const radiusMeters = campaign.radius * 1609.34; // Convert miles to meters
    let newVenuesCount = 0;

    // Process each city in the campaign
    for (const cityState of campaign.cities) {
      // Parse "City, ST" format
      const parts = cityState.split(',').map(p => p.trim());
      if (parts.length !== 2) {
        console.warn(`Invalid city format: ${cityState}`);
        continue;
      }
      
      const [city, state] = parts;
      console.log(`Processing: ${city}, ${state}`);

      // Geocode the city
      const geocodeUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(
        `${city}, ${state}`
      )}&key=${googleApiKey}`;
      
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();

      if (geocodeData.status !== 'OK' || !geocodeData.results?.[0]) {
        console.error(`Could not geocode ${city}, ${state}`);
        continue;
      }

      const coordinates = geocodeData.results[0].geometry.location;

      // Search for venues
      const searchQueries = ['bar', 'live music', 'music venue', 'nightclub'];

      for (const query of searchQueries) {
        const searchResponse = await fetch(
          `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(
            query
          )}&location=${coordinates.lat},${coordinates.lng}&radius=${radiusMeters}&type=bar|night_club&key=${googleApiKey}`
        );

        const searchData = await searchResponse.json();

        if (!searchData.results || searchData.results.length === 0) {
          continue;
        }

        // Limit to 5 per query to avoid quota issues
        const placesToProcess = searchData.results.slice(0, 5);

        for (const place of placesToProcess) {
          try {
            // Get place details
            const detailsResponse = await fetch(
              `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=place_id,name,formatted_address,formatted_phone_number,website,rating,types,url&key=${googleApiKey}`
            );

            const detailsData = await detailsResponse.json();
            const details = detailsData.result;

            if (!details) continue;

            // Parse address
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
                user_id: campaign.user_id
              }
            ]);

            if (insertError) {
              console.error('Error inserting venue:', insertError);
              continue;
            }

            console.log(`✓ Added: ${details.name}`);
            newVenuesCount++;

            // Rate limiting
            await delay(300);
          } catch (error) {
            console.error(`Error processing place:`, error);
          }
        }

        await delay(500);
      }
    }

    console.log(`Venue discovery complete. New venues added: ${newVenuesCount}`);

    // Step 2: Get ALL venues in the campaign cities
    console.log('Fetching all venues in campaign cities...');
    
    // Build city/state filters
    const cityFilters = campaign.cities.map(cityState => {
      const parts = cityState.split(',').map(p => p.trim());
      if (parts.length === 2) {
        return { city: parts[0], state: parts[1] };
      }
      return null;
    }).filter(Boolean);

    // Query venues - we'll filter by city/state in the query
    let venuesQuery = supabase
      .from('venues')
      .select('*')
      .eq('user_id', campaign.user_id);

    // For each city, we need to do an OR query
    // Supabase doesn't support complex OR conditions easily, so we'll fetch all and filter
    const { data: allUserVenues, error: venuesError } = await venuesQuery;

    if (venuesError) {
      console.error('Error fetching venues:', venuesError);
      return NextResponse.json({ error: 'Failed to fetch venues' }, { status: 500 });
    }

    // Filter venues to only those in campaign cities
    const venues = (allUserVenues || []).filter(venue => {
      return cityFilters.some(filter => 
        venue.city?.toLowerCase() === filter.city.toLowerCase() &&
        venue.state?.toLowerCase() === filter.state.toLowerCase()
      );
    });

    console.log(`Found ${venues.length} total venues in campaign cities`);

    // Step 3: Check which venues are already in this campaign
    const { data: campaignVenues, error: campaignVenuesError } = await supabase
      .from('campaign_venues')
      .select('venue_id')
      .eq('campaign_id', campaignId);

    if (campaignVenuesError) {
      console.error('Error fetching campaign venues:', campaignVenuesError);
    }

    const existingVenueIds = new Set(
      (campaignVenues || []).map(cv => cv.venue_id)
    );

    // Mark venues as already in campaign
    const venuesWithStatus = venues.map(venue => ({
      ...venue,
      in_campaign: existingVenueIds.has(venue.id)
    }));

    return NextResponse.json({
      success: true,
      newVenuesDiscovered: newVenuesCount,
      totalVenues: venues.length,
      venues: venuesWithStatus
    });

  } catch (error) {
    console.error('Campaign venue discovery error:', error);
    return NextResponse.json({
      error: 'Campaign venue discovery failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
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
