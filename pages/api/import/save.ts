import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await service
    .from('user_profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .single();

  if (!profile?.act_id) return res.status(400).json({ error: 'No act linked' });
  if (!['band_admin', 'superadmin'].includes(profile.role)) {
    return res.status(403).json({ error: 'Insufficient permissions' });
  }

  const { type, data } = req.body;
  const actId: string = profile.act_id;
  let saved = 0;
  let skipped = 0;
  const errors: string[] = [];

  if (type === 'venues') {
    for (const venue of (data?.venues ?? []) as any[]) {
      if (!venue.name) { skipped++; continue; }

      const { data: existing } = await service
        .from('venues')
        .select('id')
        .eq('act_id', actId)
        .ilike('name', venue.name.trim())
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const { error } = await service.from('venues').insert({
        act_id:          actId,
        name:            venue.name.trim(),
        city:            venue.city            || null,
        state:           venue.state           || null,
        email:           venue.email           || null,
        phone:           venue.phone           || null,
        booking_contact: venue.booking_contact || null,
        website:         venue.website         || null,
        capacity:        venue.capacity ? parseInt(String(venue.capacity), 10) : null,
        notes:           venue.notes           || null,
      });

      if (error) errors.push(`${venue.name}: ${error.message}`);
      else saved++;
    }
  }

  if (type === 'shows') {
    for (const show of (data?.shows ?? []) as any[]) {
      if (!show.show_date) { skipped++; continue; }

      // Try to match an existing venue by name
      let venueId: string | null = null;
      if (show.venue_name) {
        const { data: venueMatch } = await service
          .from('venues')
          .select('id')
          .eq('act_id', actId)
          .ilike('name', `%${show.venue_name.trim()}%`)
          .maybeSingle();
        if (venueMatch) venueId = venueMatch.id;
      }

      // Skip if a booking already exists on this date for this act
      const { data: existing } = await service
        .from('bookings')
        .select('id')
        .eq('act_id', actId)
        .eq('show_date', show.show_date)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const { error } = await service.from('bookings').insert({
        act_id:         actId,
        venue_id:       venueId,
        show_date:      show.show_date,
        status:         show.status      || 'confirmed',
        agreed_amount:  show.fee ? parseFloat(String(show.fee)) : null,
        deal_type:      show.deal_type   || null,
        set_time:       show.set_time    || null,
        notes:          show.notes       || null,
        source:         'import',
      });

      if (error) errors.push(`${show.show_date}: ${error.message}`);
      else saved++;
    }
  }

  return res.status(200).json({ success: true, saved, skipped, errors });
}
