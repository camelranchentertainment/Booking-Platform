import { useState } from 'react';

interface VenueSearchProps {
  onVenuesAdded: () => void;
}

export default function VenueSearch({ onVenuesAdded }: VenueSearchProps) {
  const [regions, setRegions] = useState<Array<{ city: string; state: string; radius: number }>>([]);
  const [newRegion, setNewRegion] = useState({ city: '', state: '', radius: 25 });
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<any>(null);

  const addRegion = () => {
    if (newRegion.city && newRegion.state) {
      setRegions([...regions, newRegion]);
      setNewRegion({ city: '', state: '', radius: 25 });
    }
  };

  const removeRegion = (index: number) => {
    setRegions(regions.filter((_, i) => i !== index));
  };

  const startDiscovery = async () => {
    if (regions.length === 0) {
      alert('Please add at least one region to search');
      return;
    }

    setIsSearching(true);
    setSearchResults(null);

    const results = {
      total_discovered: 0,
      new_venues: 0,
      duplicates: 0,
      venues: []
    };

    for (const region of regions) {
      try {
        // FIXED: Added action parameter and changed radius to radiusMiles
        const response = await fetch('/api/venues/discover', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'search_now',
            city: region.city,
            state: region.state,
            radiusMiles: region.radius
          })
        });

        if (response.ok) {
          const data = await response.json();
          // Update to match the new API response format
          if (data.success && data.venues) {
            results.total_discovered += data.venues.length;
            results.new_venues += data.venues.length;
            results.venues.push(...data.venues);
          }
        } else {
          const error = await response.json();
          console.error(`Error searching ${region.city}, ${region.state}:`, error);
        }
      } catch (error) {
        console.error(`Error searching ${region.city}, ${region.state}:`, error);
      }
    }

    setSearchResults(results);
    setIsSearching(false);
    onVenuesAdded();
  };

  const usStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
  ];

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Venue Discovery Settings</h2>

        {/* Add Region Form */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={newRegion.city}
              onChange={(e) => setNewRegion({ ...newRegion, city: e.target.value })}
              placeholder="e.g., Fayetteville"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <select
              value={newRegion.state}
              onChange={(e) => setNewRegion({ ...newRegion, state: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select State</option>
              {usStates.map(state => (
                <option key={state} value={state}>{state}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Radius (miles)</label>
            <input
              type="number"
              value={newRegion.radius}
              onChange={(e) => setNewRegion({ ...newRegion, radius: parseInt(e.target.value) })}
              min="5"
              max="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex items-end">
            <button
              onClick={addRegion}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition"
            >
              Add Region
            </button>
          </div>
        </div>

        {/* Active Regions List */}
        {regions.length > 0 && (
          <div className="mb-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Active Search Regions:</h3>
            <div className="space-y-2">
              {regions.map((region, index) => (
                <div key={index} className="flex items-center justify-between bg-gray-50 px-4 py-2 rounded">
                  <span className="text-sm">
                    {region.city}, {region.state} ({region.radius} mile radius)
                  </span>
                  <button
                    onClick={() => removeRegion(index)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Start Discovery Button */}
        <button
          onClick={startDiscovery}
          disabled={isSearching || regions.length === 0}
          className={`w-full px-6 py-3 rounded-md font-medium transition ${
            isSearching || regions.length === 0
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-green-600 text-white hover:bg-green-700'
          }`}
        >
          {isSearching ? '🔍 Searching for Venues...' : '🚀 Start Venue Discovery'}
        </button>
      </div>

      {/* Search Results */}
      {searchResults && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Discovery Results</h2>

          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-blue-50 p-4 rounded-lg text-center">
              <div className="text-3xl font-bold text-blue-600">{searchResults.total_discovered}</div>
              <div className="text-sm text-gray-600">Total Discovered</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="text-3xl font-bold text-green-600">{searchResults.new_venues}</div>
              <div className="text-sm text-gray-600">New Venues Added</div>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg text-center">
              <div className="text-3xl font-bold text-yellow-600">{searchResults.duplicates}</div>
              <div className="text-sm text-gray-600">Duplicates Skipped</div>
            </div>
          </div>

          {searchResults.venues.length > 0 && (
            <div>
              <h3 className="font-medium mb-2">Newly Added Venues:</h3>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {searchResults.venues.map((venue: any, idx: number) => (
                  <div key={venue.id || idx} className="border border-gray-200 rounded p-3 hover:bg-gray-50">
                    <div className="font-medium">{venue.name}</div>
                    <div className="text-sm text-gray-600">
                      {venue.city}, {venue.state} • {venue.venue_type || venue.venueType}
                      {venue.email && ` • ${venue.email}`}
                      {venue.phone && ` • ${venue.phone}`}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">How Venue Discovery Works</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• Searches for live music venues in specified regions (50-500 capacity)</li>
          <li>• Targets bars, saloons, pubs, clubs, and dancehalls</li>
          <li>• Automatically extracts contact information from websites</li>
          <li>• Prevents duplicate entries in the database</li>
          <li>• All discovered venues are added to your database for campaign management</li>
        </ul>
      </div>
    </div>
  );
}
