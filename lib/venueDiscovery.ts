import axios from 'axios';

interface VenueSearchParams {
  city: string;
  state: string;
  radiusMiles?: number;
}

interface DiscoveredVenue {
  name: string;
  address?: string;
  city: string;
  state: string;
  phone?: string;
  website?: string;
  email?: string;
  venueType?: string;
  source: string;
  placeId?: string;
  rating?: number;
  googleMapsUrl?: string;
}

interface GooglePlacesResult {
  place_id: string;
  name: string;
  formatted_address: string;
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
  types: string[];
  url?: string;
}

export class VenueDiscoveryService {
  private googleApiKey: string;

  constructor() {
    this.googleApiKey = process.env.GOOGLE_PLACES_API_KEY || '';
  }

  /**
   * Main search function that discovers venues in a region
   */
  async searchVenues(params: VenueSearchParams): Promise<DiscoveredVenue[]> {
    const venues: DiscoveredVenue[] = [];
    const radius = (params.radiusMiles || 25) * 1609.34; // Convert miles to meters

    // Get coordinates for the city
    const location = await this.geocodeCity(params.city, params.state);
    if (!location) {
      throw new Error(`Could not geocode ${params.city}, ${params.state}`);
    }

    // Search queries for different venue types
    const searchQueries = [
      'bar',
      'live music',
      'music venue',
      'nightclub'
    ];

    for (const query of searchQueries) {
      try {
        const results = await this.searchGooglePlaces(query, location, radius);
        venues.push(...results);
        
        // Respect API rate limits
        await this.delay(500);
      } catch (error) {
        console.error(`Error searching for "${query}":`, error);
      }
    }

    // Remove duplicates
    const uniqueVenues = this.deduplicateVenues(venues);

    return uniqueVenues;
  }

  /**
   * Geocode a city to get lat/lng coordinates
   */
  private async geocodeCity(city: string, state: string): Promise<{ lat: number; lng: number } | null> {
    try {
      const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', {
        params: {
          address: `${city}, ${state}`,
          key: this.googleApiKey
        }
      });

      if (response.data.results && response.data.results.length > 0) {
        return response.data.results[0].geometry.location;
      }
      return null;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }

  /**
   * Search Google Places API for venues
   */
  private async searchGooglePlaces(
    query: string,
    location: { lat: number; lng: number },
    radius: number
  ): Promise<DiscoveredVenue[]> {
    try {
      // Step 1: Text Search to find places
      const searchResponse = await axios.get(
        'https://maps.googleapis.com/maps/api/place/textsearch/json',
        {
          params: {
            query: query,
            location: `${location.lat},${location.lng}`,
            radius: radius,
            type: 'bar|night_club',
            key: this.googleApiKey
          }
        }
      );

      if (!searchResponse.data.results || searchResponse.data.results.length === 0) {
        return [];
      }

      const venues: DiscoveredVenue[] = [];

      // Step 2: Get details for each place (limit to first 10 to avoid quota)
      const placesToProcess = searchResponse.data.results.slice(0, 10);
      
      for (const place of placesToProcess) {
        try {
          const details = await this.getPlaceDetails(place.place_id);
          
          if (details) {
            const venue = this.convertGooglePlaceToVenue(details, query);
            if (venue) {
              venues.push(venue);
            }
          }

          // Rate limiting
          await this.delay(200);
        } catch (error) {
          console.error(`Error getting details for ${place.name}:`, error);
        }
      }

      return venues;
    } catch (error) {
      console.error('Google Places search error:', error);
      return [];
    }
  }

  /**
   * Get detailed information about a place
   */
  private async getPlaceDetails(placeId: string): Promise<GooglePlacesResult | null> {
    try {
      const response = await axios.get(
        'https://maps.googleapis.com/maps/api/place/details/json',
        {
          params: {
            place_id: placeId,
            fields: 'place_id,name,formatted_address,formatted_phone_number,website,rating,types,url',
            key: this.googleApiKey
          }
        }
      );

      return response.data.result || null;
    } catch (error) {
      console.error('Place details error:', error);
      return null;
    }
  }

  /**
   * Convert Google Place result to our venue format
   */
  private convertGooglePlaceToVenue(
    place: GooglePlacesResult,
    searchQuery: string
  ): DiscoveredVenue | null {
    // Parse address to extract city and state
    const addressParts = place.formatted_address.split(',').map(p => p.trim());
    
    let city = '';
    let state = '';
    
    if (addressParts.length >= 3) {
      city = addressParts[addressParts.length - 3];
      const stateZip = addressParts[addressParts.length - 2];
      state = stateZip.split(' ')[0];
    }

    return {
      name: place.name,
      address: place.formatted_address,
      city: city,
      state: state,
      phone: place.formatted_phone_number,
      website: place.website,
      venueType: this.determineVenueType(place.name, place.types.join(' ')),
      source: 'Google Places',
      placeId: place.place_id,
      rating: place.rating,
      googleMapsUrl: place.url
    };
  }

  /**
   * Removes duplicate venues based on name and location
   */
  private deduplicateVenues(venues: DiscoveredVenue[]): DiscoveredVenue[] {
    const uniqueVenues = new Map<string, DiscoveredVenue>();

    venues.forEach(venue => {
      const key = `${venue.name.toLowerCase()}-${venue.city.toLowerCase()}`;
      if (!uniqueVenues.has(key)) {
        uniqueVenues.set(key, venue);
      } else {
        // If duplicate exists, merge information (prefer entries with more data)
        const existing = uniqueVenues.get(key)!;
        const merged = {
          ...existing,
          phone: existing.phone || venue.phone,
          website: existing.website || venue.website,
          email: existing.email || venue.email,
          address: existing.address || venue.address
        };
        uniqueVenues.set(key, merged);
      }
    });

    return Array.from(uniqueVenues.values());
  }

  /**
   * Determines venue type from name and description
   */
  private determineVenueType(name: string, description?: string): string {
    const text = `${name} ${description || ''}`.toLowerCase();

    if (text.includes('dancehall')) return 'dancehall';
    if (text.includes('honky tonk') || text.includes('honkytonk')) return 'honky_tonk';
    if (text.includes('saloon')) return 'saloon';
    if (text.includes('pub') || text.includes('tavern')) return 'pub';
    if (text.includes('music hall')) return 'music_hall';
    if (text.includes('club') || text.includes('nightclub')) return 'club';
    if (text.includes('bar') || text.includes('grill')) return 'bar';
    
    return 'venue';
  }

  /**
   * Utility function to add delay (rate limiting)
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Score a venue based on available information (0-100)
   */
  scoreVenue(venue: DiscoveredVenue): number {
    let score = 0;
    
    // Base score for having basic info
    score += 20;
    
    // Contact information
    if (venue.email) score += 30;
    if (venue.phone) score += 20;
    if (venue.website) score += 10;
    
    // Rating quality
    if (venue.rating) {
      score += Math.round(venue.rating * 4); // 5-star = 20 points
    }
    
    return Math.min(score, 100);
  }
}

export const venueDiscovery = new VenueDiscoveryService();
