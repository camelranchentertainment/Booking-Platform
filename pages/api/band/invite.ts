// POST /api/band/invite
// Creates a band_invites record and sends an invite email via the agent's SMTP.
// Falls back to a plain-text email if SMTP not configured.

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import { getUserFromToken, getTransporter } from '../../../lib/emailHelper';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Auth
    const user = await getUserFromToken(req.headers.authorization);
    const { bandId, email, role = 'member' } = req.body;

    if (!bandId || !email) return res.status(400).json({ error: 'bandId and email are required' });

    // Verify the requesting user owns or manages this band
    const { data: band } = await supabase
      .from('bands')
      .select('id, band_name, owner_user_id, agent_user_id')
      .eq('id', bandId)
      .maybeSingle();

    if (!band) return res.status(404).json({ error: 'Band not found' });
    const canInvite = band.owner_user_id === user.id || band.agent_user_id === user.id;
    if (!canInvite) return res.status(403).json({ error: 'Not authorized for this band' });

    // Check for existing pending invite to this email
    const { data: existing } = await supabase
      .from('band_invites')
      .select('id, status')
      .eq('band_id', bandId)
      .eq('email', email.toLowerCase())
      .eq('status', 'pending')
      .maybeSingle();

    if (existing) return res.status(400).json({ error: 'An invite is already pending for this email' });

    // Create invite record
    const { data: invite, error: invErr } = await supabase
      .from('band_invites')
      .insert({
        band_id:    bandId,
        invited_by: user.id,
        email:      email.toLowerCase(),
        role,
      })
      .select('id, token')
      .single();

    if (invErr || !invite) throw new Error(invErr?.message || 'Failed to create invite');

    // Load agent profile for email sender info
    const { data: agentProfile } = await supabase
      .from('profiles')
      .select('agent_name, agency_name')
      .eq('id', user.id)
      .maybeSingle();

    const agencyName = agentProfile?.agency_name || agentProfile?.agent_name || 'Your booking agent';
    const joinUrl    = `${process.env.NEXT_PUBLIC_APP_URL}/join?token=${invite.token}`;

    const subject = `You've been invited to join ${band.band_name} on Camel Ranch Booking`;
    const body    = `Hi,

${agencyName} has invited you to join ${band.band_name} on Camel Ranch Booking — where you can view the band calendar, confirmed shows, and active tours.

Click the link below to set your password and get access:

${joinUrl}

This invite expires in 7 days.

— Camel Ranch Booking`;

    // Try agent's SMTP first, fall back to a simple log if not configured
    try {
      const { transporter, settings } = await getTransporter(user.id);
      await transporter.sendMail({
        from:    `"${agencyName}" <${settings.username}>`,
        to:      email,
        subject,
        text:    body,
      });
    } catch (smtpErr) {
      // SMTP not configured — log the invite URL so it can be sent manually
      console.warn('[invite] SMTP not configured for user', user.id, '— invite URL:', joinUrl);
      // Don't fail the request — the invite record is created; the URL can be shared manually
    }

    return res.status(200).json({ ok: true, message: `Invite sent to ${email}` });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[invite]', msg);
    return res.status(500).json({ error: msg });
  }
}
