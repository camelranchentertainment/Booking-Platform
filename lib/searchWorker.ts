import { venueDiscovery } from './venueDiscovery';
import {
  supabase,
  addVenue,
  checkDuplicateVenue,
  getActiveSearchRegions,
  queueSearch
} from './supabase';

interface SearchQueueItem {
  id: string;
  region_id: string;
  search_query: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  created_at: string;
}

interface SearchRegion {
  id: string;
  city: string;
  state: string;
  radius_miles: number;
  is_active: boolean;
}

export class VenueSearchWorker {
  private isRunning = false;
  private pollInterval = 30000; // 30 seconds

  /**
   * Start the background worker
   */
  async start() {
    if (this.isRunning) {
      console.log('Worker already running');
      return;
    }

    this.isRunning = true;
    console.log('🚀 Venue search worker started');

    // Process queue continuously
    while (this.isRunning) {
      try {
        await this.processQueue();
      } catch (error) {
        console.error('Error processing queue:', error);
      }

      // Wait before next poll
      await this.delay(this.pollInterval);
    }
  }

  /**
   * Stop the worker
   */
  stop() {
    this.isRunning = false;
    console.log('🛑 Venue search worker stopped');
  }

  /**
   * Process pending searches in the queue
   */
  private async processQueue() {
    // Get pending searches
    const { data: pendingSearches, error } = await supabase
      .from('search_queue')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error) {
      console.error('Error fetching queue:', error);
      return;
    }

    if (!pendingSearches || pendingSearches.length === 0) {
      return;
    }

    console.log(`📋 Processing ${pendingSearches.length} queued searches`);

    for (const search of pendingSearches) {
      try {
        await this.processSearch(search);
      } catch (error) {
        console.error(`Error processing search ${search.id}:`, error);
        
        // Mark as failed
        await supabase
          .from('search_queue')
          .update({
            status: 'failed',
            error_message: error instanceof Error ? error.message : 'Unknown error'
          })
          .eq('id', search.id);
      }
    }
  }

  /**
   * Process a single search item
   */
  private async processSearch(search: SearchQueueItem) {
    console.log(`🔍 Processing search: ${search.search_query}`);

    // Mark as processing
    await supabase
      .from('search_queue')
      .update({ status: 'processing' })
      .eq('id', search.id);

    // Get region details
    const { data: region } = await supabase
      .from('search_regions')
      .select('*')
      .eq('id', search.region_id)
      .single();

    if (!region) {
      throw new Error(`Region not found: ${search.region_id}`);
    }

    // Perform the search
    const venues = await venueDiscovery.searchVenues({
      city: region.city,
      state: region.state,
      radiusMiles: region.radius_miles
    });

    console.log(`✅ Found ${venues.length} venues`);

    // Save venues to database
    let savedCount = 0;
    let duplicateCount = 0;

    for (const venue of venues) {
      try {
        // Check for duplicates
       const duplicate = await checkDuplicateVenue(venue.name, venue.city, venue.state);
        
        if (!duplicate) {
          await addVenue({
            name: venue.name,
            address: venue.address,
            city: venue.city,
            state: venue.state,
            phone: venue.phone,
            website: venue.website,
            email: venue.email,
            venue_type: venue.venueType,
            source: venue.source,
            place_id: venue.placeId,
            rating: venue.rating,
            google_maps_url: venue.googleMapsUrl,
            contact_status: venue.email ? 'ready' : 'needs_contact_info',
            discovery_score: venueDiscovery.scoreVenue(venue)
          });
          savedCount++;
        } else {
          duplicateCount++;
          
          // Update existing venue if we found new contact info
          if ((venue.email && !duplicate.email) || 
              (venue.phone && !duplicate.phone) ||
              (venue.website && !duplicate.website)) {
            await supabase
              .from('venues')
              .update({
                email: venue.email || duplicate.email,
                phone: venue.phone || duplicate.phone,
                website: venue.website || duplicate.website,
                contact_status: venue.email ? 'ready' : duplicate.contact_status
              })
              .eq('id', duplicate.id);
          }
        }
      } catch (error) {
        console.error(`Error saving venue ${venue.name}:`, error);
      }
    }

    console.log(`💾 Saved ${savedCount} new venues, ${duplicateCount} duplicates`);

    // Mark search as completed
    await supabase
      .from('search_queue')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        results_count: savedCount
      })
      .eq('id', search.id);

    // Update region last_searched timestamp
    await supabase
      .from('search_regions')
      .update({
        last_searched: new Date().toISOString(),
        total_venues_found: region.total_venues_found + savedCount
      })
      .eq('id', search.region_id);
  }

  /**
   * Queue searches for all active regions
   */
  async queueAllActiveRegions() {
    const regions = await getActiveSearchRegions();
    
    if (!regions || regions.length === 0) {
      console.log('No active search regions found');
      return;
    }

    console.log(`📍 Queuing searches for ${regions.length} active regions`);

    for (const region of regions) {
      // Check if region was recently searched (within 7 days)
      if (region.last_searched) {
        const daysSinceSearch = Math.floor(
          (Date.now() - new Date(region.last_searched).getTime()) / (1000 * 60 * 60 * 24)
        );
        
        if (daysSinceSearch < 7) {
          console.log(`⏭️ Skipping ${region.city}, ${region.state} - searched ${daysSinceSearch} days ago`);
          continue;
        }
      }

      // Queue the search
     await queueSearch({
  region_id: region.id,
  search_query: `${region.city}, ${region.state} live music venues`
});
      
      console.log(`✅ Queued: ${region.city}, ${region.state}`);
    }
  }

  /**
   * One-time search for a specific region
   */
  async searchRegionNow(city: string, state: string, radiusMiles = 25) {
    console.log(`🎯 Immediate search: ${city}, ${state}`);

    const venues = await venueDiscovery.searchVenues({
      city,
      state,
      radiusMiles
    });

    console.log(`✅ Found ${venues.length} venues`);

    // Save all venues
    const savedVenues: any[] = [];
    for (const venue of venues) {
     const duplicate = await checkDuplicateVenue(venue.name, venue.city, venue.state);
      
      if (!duplicate) {
        const saved = await addVenue({
          name: venue.name,
          address: venue.address,
          city: venue.city,
          state: venue.state,
          phone: venue.phone,
          website: venue.website,
          email: venue.email,
          venue_type: venue.venueType,
          source: venue.source,
          place_id: venue.placeId,
          rating: venue.rating,
          google_maps_url: venue.googleMapsUrl,
          contact_status: venue.email ? 'ready' : 'needs_contact_info',
          discovery_score: venueDiscovery.scoreVenue(venue)
        });
        savedVenues.push(saved);
      }
    }

    console.log(`💾 Saved ${savedVenues.length} new venues`);
    return savedVenues;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const searchWorker = new VenueSearchWorker();

// For manual execution
if (require.main === module) {
  console.log('🎵 Starting Camel Ranch Booking - Venue Discovery Worker');
  searchWorker.start();
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down gracefully...');
    searchWorker.stop();
    process.exit(0);
  });
}
