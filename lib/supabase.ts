import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ============================================
// VENUE MANAGEMENT FUNCTIONS
// ============================================

export async function getVenues(filters?: {
  city?: string;
  state?: string;
  contact_status?: string;
  venue_type?: string;
  has_live_music?: boolean;
  search_region?: string;
}) {
  let query = supabase.from('venues').select('*');
  
  if (filters) {
    if (filters.city) query = query.eq('city', filters.city);
    if (filters.state) query = query.eq('state', filters.state);
    if (filters.contact_status) query = query.eq('contact_status', filters.contact_status);
    if (filters.venue_type) query = query.eq('venue_type', filters.venue_type);
    if (filters.has_live_music !== undefined) query = query.eq('has_live_music', filters.has_live_music);
    if (filters.search_region) query = query.eq('search_region', filters.search_region);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function getVenueById(id: string) {
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
}

export async function addVenue(venueData: any) {
  const { data, error } = await supabase
    .from('venues')
    .insert([venueData])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateVenue(id: string, updates: any) {
  const { data, error } = await supabase
    .from('venues')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteVenue(id: string) {
  const { error } = await supabase
    .from('venues')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

export async function checkDuplicateVenue(name: string, city: string, state: string) {
  const { data, error } = await supabase
    .from('venues')
    .select('*')
    .ilike('name', name)
    .ilike('city', city)
    .eq('state', state)
    .limit(1);
  
  return data && data.length > 0 ? data[0] : null;
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

// ============================================
// CAMPAIGN MANAGEMENT FUNCTIONS
// ============================================

export async function getCampaigns(filters?: {
  status?: string;
}) {
  let query = supabase.from('campaigns').select('*');
  
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function getCampaignById(id: string) {
  const { data, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
}

export async function createCampaign(campaignData: any) {
  const { data, error } = await supabase
    .from('campaigns')
    .insert([campaignData])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateCampaign(id: string, updates: any) {
  const { data, error } = await supabase
    .from('campaigns')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteCampaign(id: string) {
  const { error } = await supabase
    .from('campaigns')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

// ============================================
// CAMPAIGN VENUES (JUNCTION TABLE)
// ============================================

export async function addVenueToCampaign(campaignId: string, venueId: string) {
  const { data, error } = await supabase
    .from('campaign_venues')
    .insert([{ campaign_id: campaignId, venue_id: venueId }])
    .select();
  
  if (error) throw error;
  return data;
}

export async function removeVenueFromCampaign(campaignId: string, venueId: string) {
  const { error } = await supabase
    .from('campaign_venues')
    .delete()
    .eq('campaign_id', campaignId)
    .eq('venue_id', venueId);
  
  if (error) throw error;
}

export async function getCampaignVenues(campaignId: string) {
  const { data, error } = await supabase
    .from('campaign_venues')
    .select(`
      venue_id,
      added_at,
      venue:venues(*)
    `)
    .eq('campaign_id', campaignId);
  
  if (error) throw error;
  return data || [];
}

// ============================================
// EMAIL TEMPLATE FUNCTIONS
// ============================================

export async function getEmailTemplates() {
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function getEmailTemplateById(id: string) {
  const { data, error } = await supabase
    .from('email_templates')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
}

export async function createEmailTemplate(templateData: any) {
  const { data, error } = await supabase
    .from('email_templates')
    .insert([templateData])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateEmailTemplate(id: string, updates: any) {
  const { data, error } = await supabase
    .from('email_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteEmailTemplate(id: string) {
  const { error } = await supabase
    .from('email_templates')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

// ============================================
// EMAIL LOG FUNCTIONS
// ============================================

export async function logEmail(emailData: {
  venue_id: string;
  campaign_id?: string;
  email_template_id?: string;
  response_type?: string;
  response_notes?: string;
}) {
  const { data, error } = await supabase
    .from('email_logs')
    .insert([{
      ...emailData,
      sent_at: new Date().toISOString()
    }])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getEmailLogs(filters?: {
  venue_id?: string;
  campaign_id?: string;
  response_type?: string;
}) {
  let query = supabase.from('email_logs').select(`
    *,
    venue:venues(name, city, state, email),
    campaign:campaigns(name),
    email_template:email_templates(name, subject)
  `);
  
  if (filters) {
    if (filters.venue_id) query = query.eq('venue_id', filters.venue_id);
    if (filters.campaign_id) query = query.eq('campaign_id', filters.campaign_id);
    if (filters.response_type) query = query.eq('response_type', filters.response_type);
  }
  
  const { data, error } = await query.order('sent_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function updateEmailLog(id: string, updates: any) {
  const { data, error } = await supabase
    .from('email_logs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ============================================
// SEARCH REGION FUNCTIONS
// ============================================

export async function getSearchRegions(filters?: {
  is_active?: boolean;
  state?: string;
}) {
  let query = supabase.from('search_regions').select('*');
  
  if (filters) {
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);
    if (filters.state) query = query.eq('state', filters.state);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function getActiveSearchRegions() {
  return getSearchRegions({ is_active: true });
}

export async function addSearchRegion(regionData: any) {
  const { data, error } = await supabase
    .from('search_regions')
    .insert([regionData])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateSearchRegion(id: string, updates: any) {
  const { data, error } = await supabase
    .from('search_regions')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ============================================
// SEARCH QUEUE FUNCTIONS
// ============================================

export async function queueSearch(searchData: {
  region_id: string;
  search_query: string;
}) {
  const { data, error } = await supabase
    .from('search_queue')
    .insert([{
      ...searchData,
      status: 'pending'
    }])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getSearchQueue(filters?: {
  status?: string;
  region_id?: string;
}) {
  let query = supabase.from('search_queue').select(`
    *,
    region:search_regions(city, state)
  `);
  
  if (filters) {
    if (filters.status) query = query.eq('status', filters.status);
    if (filters.region_id) query = query.eq('region_id', filters.region_id);
  }
  
  const { data, error } = await query.order('created_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function updateSearchQueue(id: string, updates: any) {
  const { data, error } = await supabase
    .from('search_queue')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

// ============================================
// BOOKING RUN FUNCTIONS
// ============================================

export async function getBookingRuns(filters?: {
  status?: string;
}) {
  let query = supabase.from('booking_runs').select('*');
  
  if (filters?.status) {
    query = query.eq('status', filters.status);
  }
  
  const { data, error } = await query.order('start_date', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function getBookingRunById(id: string) {
  const { data, error } = await supabase
    .from('booking_runs')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error) throw error;
  return data;
}

export async function createBookingRun(runData: any) {
  const { data, error } = await supabase
    .from('booking_runs')
    .insert([runData])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateBookingRun(id: string, updates: any) {
  const { data, error } = await supabase
    .from('booking_runs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteBookingRun(id: string) {
  const { error } = await supabase
    .from('booking_runs')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}

// ============================================
// SOCIAL MEDIA POST FUNCTIONS
// ============================================

export async function getSocialMediaPosts(filters?: {
  booking_id?: string;
  platform?: string;
  status?: string;
}) {
  let query = supabase.from('social_media_posts').select('*');
  
  if (filters) {
    if (filters.booking_id) query = query.eq('booking_id', filters.booking_id);
    if (filters.platform) query = query.eq('platform', filters.platform);
    if (filters.status) query = query.eq('status', filters.status);
  }
  
  const { data, error } = await query.order('post_date', { ascending: true });
  
  if (error) throw error;
  return data || [];
}

export async function createSocialMediaPost(postData: any) {
  const { data, error } = await supabase
    .from('social_media_posts')
    .insert([postData])
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function updateSocialMediaPost(id: string, updates: any) {
  const { data, error } = await supabase
    .from('social_media_posts')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function deleteSocialMediaPost(id: string) {
  const { error } = await supabase
    .from('social_media_posts')
    .delete()
    .eq('id', id);
  
  if (error) throw error;
}
