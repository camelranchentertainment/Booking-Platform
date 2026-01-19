import axios from 'axios';
import * as cheerio from 'cheerio';

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

    // Search queries for different venue types matching your genre
    const searchQueries = [
      'live music bar',
      'country music venue',
      'dancehall',
      'saloon',
      'honky tonk',
      'live music venue',
      'music hall',
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

    // Enrich with contact information
    const enrichedVenues = await this.enrichVenuesWithContacts(uniqueVenues);

    return enrichedVenues;
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

      // Step 2: Get details for each place
      for (const place of searchResponse.data.results) {
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
    
    // Usually format is: "123 Street, City, ST ZIP, Country"
    let city = '';
    let state = '';
    
    if (addressParts.length >= 3) {
      city = addressParts[addressParts.length - 3];
      const stateZip = addressParts[addressParts.length - 2];
      state = stateZip.split(' ')[0]; // Extract state code
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
   * Enrich venues with email addresses from their websites
   * DISABLED FOR NOW - causes memory issues
   */
  private async enrichVenuesWithContacts(venues: DiscoveredVenue[]): Promise<DiscoveredVenue[]> {
    // Skip email scraping for now to avoid memory issues
    // You can enable this later by processing venues in smaller batches
    console.log('Skipping email enrichment to avoid memory issues');
    return venues;
  }

  /**
   * Extracts email addresses from a website
   */
  async extractEmailFromWebsite(url: string): Promise<string[]> {
    try {
      // Ensure URL has protocol
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }

      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000,
        maxRedirects: 5
      });

      const $ = cheerio.load(response.data);
      const emails = new Set<string>();

      // Extract from mailto links
      $('a[href^="mailto:"]').each((_, element) => {
        const email = $(element).attr('href')?.replace('mailto:', '').split('?')[0];
        if (email && this.isValidEmail(email)) {
          emails.add(email.toLowerCase());
        }
      });

      // Extract from text content using regex
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
      const bodyText = $('body').text();
      const matches = bodyText.match(emailRegex);

      if (matches) {
        matches.forEach(email => {
          if (this.isValidEmail(email)) {
            emails.add(email.toLowerCase());
          }
        });
      }

      // Look specifically in contact/booking sections
      const contactSelectors = [
        'div:contains("contact")',
        'section:contains("contact")',
        'div:contains("booking")',
        'div:contains("book us")',
        '.contact',
        '#contact',
        '.booking',
        '#booking'
      ];

      contactSelectors.forEach(selector => {
        $(selector).each((_, section) => {
          const sectionText = $(section).text();
          const sectionMatches = sectionText.match(emailRegex);
          if (sectionMatches) {
            sectionMatches.forEach(email => {
              if (this.isValidEmail(email)) {
                emails.add(email.toLowerCase());
              }
            });
          }
        });
      });

      // Try common contact pages
      if (emails.size === 0) {
        const contactPages = ['/contact', '/contact-us', '/booking', '/book'];
        for (const page of contactPages) {
          try {
            const contactUrl = new URL(page, url).href;
            const contactEmails = await this.extractEmailFromWebsite(contactUrl);
            contactEmails.forEach(email => emails.add(email));
            
            if (emails.size > 0) break;
          } catch {
            // Continue to next contact page
          }
        }
      }

      return Array.from(emails).filter(email =>
        !email.includes('example.com') &&
        !email.includes('sampleemail') &&
        !email.includes('youremail') &&
        !email.includes('noreply') &&
        !email.includes('no-reply')
      );
    } catch (error) {
      console.error(`Error extracting email from ${url}:`, error);
      return [];
    }
  }

  /**
   * Extracts contact info from Facebook page
   */
  async extractFacebookInfo(facebookUrl: string): Promise<{ email?: string; phone?: string }> {
    try {
      // Note: Facebook scraping is challenging due to anti-bot measures
      // Consider using Facebook Graph API for better results
      
      const response = await axios.get(facebookUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });

      const $ = cheerio.load(response.data);
      const info: { email?: string; phone?: string } = {};

      // Extract email
      const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
      const pageText = $('body').text();
      const emailMatches = pageText.match(emailRegex);

      if (emailMatches && emailMatches.length > 0) {
        const validEmails = emailMatches.filter(e => this.isValidEmail(e));
        if (validEmails.length > 0) {
          info.email = validEmails[0].toLowerCase();
        }
      }

      // Extract phone
      const phoneRegex = /(\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
      const phoneMatches = pageText.match(phoneRegex);

      if (phoneMatches && phoneMatches.length > 0) {
        info.phone = this.formatPhoneNumber(phoneMatches[0]);
      }

      return info;
    } catch (error) {
      console.error(`Error extracting Facebook info from ${facebookUrl}:`, error);
      return {};
    }
  }

  /**
   * Format phone number to standard format
   */
  private formatPhoneNumber(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  }

  /**
   * Validates email format
   */
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+$/;
    return emailRegex.test(email) && email.length < 100;
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
  determineVenueType(name: string, description?: string): string {
    const text = `${name} ${description || ''}`.toLowerCase();

    if (text.includes('dancehall')) return 'dancehall';
    if (text.includes('honky tonk') || text.includes('honkytonk')) return 'honky_tonk';
    if (text.includes('saloon')) return 'saloon';
    if (text.includes('pub') || text.includes('tavern')) return 'pub';
    if (text.includes('music hall')) return 'music_hall';
    if (text.includes('club') || text.includes('nightclub')) return 'club';
    if (text.includes('bar') || text.includes('grill')) return 'bar';
    
    return 'venue'; // default
  }

  /**
   * Validates that venue meets capacity requirements (50-500)
   */
  meetsCapacityRequirements(capacity?: number): boolean {
    if (!capacity) return true; // Unknown capacity passes
    return capacity >= 50 && capacity <= 500;
  }

  /**
   * Utility function to add delay (rate limiting)
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Score venue based on how well it matches your target criteria
   */
  scoreVenue(venue: DiscoveredVenue): number {
    let score = 0;

    // Has contact info
    if (venue.email) score += 30;
    if (venue.phone) score += 20;
    if (venue.website) score += 15;

    // Venue type matches your genre
    const preferredTypes = ['honky_tonk', 'dancehall', 'saloon', 'country'];
    if (preferredTypes.some(type => venue.venueType?.includes(type))) {
      score += 25;
    }

    // Has good rating
    if (venue.rating && venue.rating >= 4.0) score += 10;

    return score;
  }
}

export const venueDiscovery = new VenueDiscoveryService();
