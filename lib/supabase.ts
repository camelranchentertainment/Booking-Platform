import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Venue Management Functions
export async function addVenue(venueData: any) {
  const { data, error } = await supabase
    .from('venues')
    .insert([venueData])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function checkDuplicateVenue(name: string, city: string, state: string) {
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('name', name)
    .eq('city', city)
    .eq('state', state)
    .single();
  
  return data;
}

export async function updateVenueContactStatus(venueId: string, status: string) {
  const { data, error } = await supabase
    .from('venues')
    .update({ contact_status: status })
    .eq('id', venueId)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// Search Region Management
export async function addSearchRegion(regionData: any) {
  const { data, error } = await supabase
    .from('search_regions')
    .insert([regionData])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getActiveSearchRegions() {
  const { data, error } = await supabase
    .from('search_regions')
    .select('*')
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

// Search Queue Management
export async function queueSearch(searchData: any) {
  const { data, error } = await supabase
    .from('search_queue')
    .insert([searchData])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// Email Logging
export async function logEmail(emailData: any) {
  const { data, error } = await supabase
    .from('email_logs')
    .insert([{
      venue_id: emailData.venue_id,
      campaign_id: emailData.campaign_id,
      recipient_email: emailData.recipient_email,
      subject: emailData.subject,
      body: emailData.body,
      status: emailData.status || 'sent',
      sent_at: new Date().toISOString()
    }])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}
