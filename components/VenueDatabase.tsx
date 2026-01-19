import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export default function VenueDatabase() {
  const [venues, setVenues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    city: '',
    state: '',
    venueType: '',
    contactStatus: ''
  });
  const [selectedVenue, setSelectedVenue] = useState<any>(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    loadVenues();
  }, [filters]);

  const loadVenues = async () => {
    setLoading(true);
    try {
      let query = supabase.from('venues').select('*');
      
      if (filters.city) query = query.ilike('city', `%${filters.city}%`);
      if (filters.state) query = query.eq('state', filters.state);
      if (filters.venueType) query = query.eq('venue_type', filters.venueType);
      if (filters.contactStatus) query = query.eq('contact_status', filters.contactStatus);
      
      const { data, error } = await query.order('created_at', { ascending: false });
      
      if (error) throw error;
      setVenues(data || []);
    } catch (error) {
      console.error('Error loading venues:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateVenueStatus = async (venueId: string, status: string) => {
    try {
      const { error } = await supabase
        .from('venues')
        .update({ 
          contact_status: status,
          last_contacted: new Date().toISOString()
        })
        .eq('id', venueId);
      
      if (error) throw error;
      loadVenues();
    } catch (error) {
      console.error('Error updating venue:', error);
    }
  };

  const exportToCSV = () => {
    const headers = ['Name', 'City', 'State', 'Type', 'Email', 'Phone', 'Website', 'Status'];
    const rows = venues.map(v => [
      v.name,
      v.city,
      v.state,
      v.venue_type,
      v.email || '',
      v.phone || '',
      v.website || '',
      v.contact_status
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `venues-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  const getStatusColor = (status: string) => {
    const colors: { [key: string]: string } = {
      'not_contacted': 'bg-gray-100 text-gray-800',
      'awaiting_response': 'bg-yellow-100 text-yellow-800',
      'responded': 'bg-blue-100 text-blue-800',
      'booked': 'bg-green-100 text-green-800',
      'declined': 'bg-red-100 text-red-800',
      'no_response': 'bg-orange-100 text-orange-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">Filter Venues</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
            <input
              type="text"
              value={filters.city}
              onChange={(e) => setFilters({ ...filters, city: e.target.value })}
              placeholder="Search by city..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
            <input
              type="text"
              value={filters.state}
              onChange={(e) => setFilters({ ...filters, state: e.target.value })}
              placeholder="e.g., AR"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Venue Type</label>
            <select
              value={filters.venueType}
              onChange={(e) => setFilters({ ...filters, venueType: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Types</option>
              <option value="bar">Bar</option>
              <option value="saloon">Saloon</option>
              <option value="pub">Pub</option>
              <option value="club">Club</option>
              <option value="dancehall">Dancehall</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Contact Status</label>
            <select
              value={filters.contactStatus}
              onChange={(e) => setFilters({ ...filters, contactStatus: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All Statuses</option>
              <option value="not_contacted">Not Contacted</option>
              <option value="awaiting_response">Awaiting Response</option>
              <option value="responded">Responded</option>
              <option value="booked">Booked</option>
              <option value="declined">Declined</option>
              <option value="no_response">No Response</option>
            </select>
          </div>
        </div>
        
        <div className="mt-4 flex justify-between items-center">
          <div className="text-sm text-gray-600">
            Showing {venues.length} venue{venues.length !== 1 ? 's' : ''}
          </div>
          <button
            onClick={exportToCSV}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition text-sm"
          >
            📥 Export to CSV
          </button>
        </div>
      </div>

      {/* Venues Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading venues...</div>
        ) : venues.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No venues found. Try adjusting your filters or discover new venues.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Venue
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Location
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Contact
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {venues.map((venue) => (
                  <tr key={venue.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{venue.name}</div>
                      {venue.website && (
                        <a 
                          href={venue.website} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-xs text-blue-600 hover:underline"
                        >
                          Website
                        </a>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{venue.city}, {venue.state}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900 capitalize">{venue.venue_type}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">{venue.email || 'No email'}</div>
                      {venue.phone && <div className="text-xs text-gray-500">{venue.phone}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(venue.contact_status)}`}>
                        {venue.contact_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <button
                        onClick={() => {
                          setSelectedVenue(venue);
                          setShowDetails(true);
                        }}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        View
                      </button>
                      <select
                        value={venue.contact_status}
                        onChange={(e) => updateVenueStatus(venue.id, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="not_contacted">Not Contacted</option>
                        <option value="awaiting_response">Awaiting Response</option>
                        <option value="responded">Responded</option>
                        <option value="booked">Booked</option>
                        <option value="declined">Declined</option>
                        <option value="no_response">No Response</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Venue Details Modal */}
      {showDetails && selectedVenue && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-2xl font-bold">{selectedVenue.name}</h3>
              <button
                onClick={() => setShowDetails(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="font-medium text-gray-700">Location:</label>
                <p className="text-gray-900">{selectedVenue.address || selectedVenue.city}, {selectedVenue.state} {selectedVenue.zip_code}</p>
              </div>
              
              <div>
                <label className="font-medium text-gray-700">Venue Type:</label>
                <p className="text-gray-900 capitalize">{selectedVenue.venue_type}</p>
              </div>
              
              {selectedVenue.email && (
                <div>
                  <label className="font-medium text-gray-700">Email:</label>
                  <p className="text-gray-900">{selectedVenue.email}</p>
                </div>
              )}
              
              {selectedVenue.phone && (
                <div>
                  <label className="font-medium text-gray-700">Phone:</label>
                  <p className="text-gray-900">{selectedVenue.phone}</p>
                </div>
              )}
              
              {selectedVenue.website && (
                <div>
                  <label className="font-medium text-gray-700">Website:</label>
                  <a href={selectedVenue.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                    {selectedVenue.website}
                  </a>
                </div>
              )}
              
              {selectedVenue.notes && (
                <div>
                  <label className="font-medium text-gray-700">Notes:</label>
                  <p className="text-gray-900">{selectedVenue.notes}</p>
                </div>
              )}
              
              <div>
                <label className="font-medium text-gray-700">Contact Status:</label>
                <p className={`inline-block px-3 py-1 rounded-full text-sm ${getStatusColor(selectedVenue.contact_status)}`}>
                  {selectedVenue.contact_status.replace('_', ' ')}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
