import { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get total venues
    const { count: totalVenues } = await supabase
      .from('venues')
      .select('*', { count: 'exact', head: true });

    // Get contacted venues
    const { count: contacted } = await supabase
      .from('venues')
      .select('*', { count: 'exact', head: true })
      .neq('contact_status', 'not_contacted');

    // Get venues with responses
    const { count: responses } = await supabase
      .from('venues')
      .select('*', { count: 'exact', head: true })
      .in('contact_status', ['responded', 'booked']);

    // Get bookings
    const { count: bookings } = await supabase
      .from('venues')
      .select('*', { count: 'exact', head: true })
      .eq('contact_status', 'booked');

    return res.status(200).json({
      totalVenues: totalVenues || 0,
      contacted: contacted || 0,
      responses: responses || 0,
      bookings: bookings || 0
    });
  } catch (error: any) {
    console.error('Stats error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
