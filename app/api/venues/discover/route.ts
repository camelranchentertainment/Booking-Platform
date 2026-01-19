// app/api/venues/discover/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { searchWorker } from '../../../../lib/searchWorker';
import { addSearchRegion } from '../../../../lib/supabase';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;

    switch (action) {
      case 'search_now':
        // Immediate search for a specific region
        const { city, state, radiusMiles } = params;
        
        if (!city || !state) {
          return NextResponse.json(
            { error: 'City and state are required' },
            { status: 400 }
          );
        }

        const venues = await searchWorker.searchRegionNow(city, state, radiusMiles);
        
        return NextResponse.json({
          success: true,
          message: `Found and saved ${venues.length} venues`,
          venues
        });

      case 'add_region':
        // Add a new search region
        const region = await addSearchRegion({
          city: params.city,
          state: params.state,
          radius_miles: params.radiusMiles || 25,
          is_active: true,
          search_frequency_days: params.searchFrequencyDays || 7
        });

        return NextResponse.json({
          success: true,
          message: 'Region added successfully',
          region
        });

      case 'queue_active_regions':
        // Queue searches for all active regions
        await searchWorker.queueAllActiveRegions();
        
        return NextResponse.json({
          success: true,
          message: 'Active regions queued for search'
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Venue discovery API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'health') {
      return NextResponse.json({
        status: 'ok',
        message: 'Venue discovery API is running'
      });
    }

    return NextResponse.json({
      error: 'Invalid action'
    }, { status: 400 });
  } catch (error) {
    console.error('Venue discovery API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
