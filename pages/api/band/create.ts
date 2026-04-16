import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bandName } = req.body;
  if (!bandName?.trim()) return res.status(400).json({ error: 'Band name is required' });

  // Verify the caller is authenticated
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Not authenticated' });

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

  // Guard: don't create a duplicate
  const { data: existing } = await supabase
    .from('bands')
    .select('id')
    .eq('owner_user_id', user.id)
    .maybeSingle();

  if (existing) return res.status(409).json({ error: 'A band already exists for this account' });

  // Create the band (service role bypasses RLS)
  const { data: band, error: bandError } = await supabase
    .from('bands')
    .insert({ owner_user_id: user.id, band_name: bandName.trim() })
    .select()
    .single();

  if (bandError) {
    console.error('Band create error:', bandError);
    return res.status(500).json({ error: bandError.message });
  }

  return res.status(200).json({ band });
}
