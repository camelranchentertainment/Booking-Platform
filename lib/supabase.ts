import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Helper functions for database operations

export async function addVenue(venue: any) {
  const { data, error } = await supabase
    .from('venues')
    .insert([venue])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function checkDuplicateVenue(name: string, city: string) {
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .ilike('name', name)
    .ilike('city', city)
    .limit(1);
  
  if (error) throw error;
  return data && data.length > 0 ? data[0] : null;
}

export async function getVenues(filters?: any) {
  let query = supabase.from('venues').select('*');
  
  if (filters?.city) query = query.eq('city', filters.city);
  if (filters?.state) query = query.eq('state', filters.state);
  if (filters?.venue_type) query = query.eq('venue_type', filters.venue_type);
  if (filters?.contact_status) query = query.eq('contact_status', filters.contact_status);
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function updateVenueContactStatus(venueId: string, status: string) {
  const { data, error } = await supabase
    .from('venues')
    .update({ 
      contact_status: status,
      last_contacted: new Date().toISOString()
    })
    .eq('id', venueId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function createCampaign(campaign: any) {
  const { data, error } = await supabase
    .from('campaigns')
    .insert([campaign])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getCampaigns() {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data;
}

export async function addVenueToCampaign(campaignId: string, venueId: string) {
  const { data, error } = await supabase
    .from('campaign_venues')
    .insert([{ campaign_id: campaignId, venue_id: venueId }]);
  
  if (error) throw error;
  return data;
}

export async function logEmail(emailLog: any) {
  const { data, error } = await supabase
    .from('email_logs')
    .insert([emailLog])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function addSearchRegion(region: any) {
  const { data, error } = await supabase
    .from('search_regions')
    .insert([region])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getActiveSearchRegions() {
  const { data, error } = await supabase
    .from('search_regions')
    .select('*')
    .eq('is_active', true);
  
  if (error) throw error;
  return data;
}

export async function queueSearch(regionId: string, query: string) {
  const { data, error } = await supabase
    .from('search_queue')
    .insert([{
      region_id: regionId,
      search_query: query,
      status: 'pending'
    }])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}
