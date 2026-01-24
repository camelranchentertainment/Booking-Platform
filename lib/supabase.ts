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

