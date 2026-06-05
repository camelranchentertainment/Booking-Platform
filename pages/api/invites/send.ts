import { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';
import { createNotification } from '../../../lib/notifications';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: profile } = await service
    .from('profiles')
    .select('act_id, role')
    .eq('id', user.id)
    .single();

  if (!['band_admin', 'superadmin'].includes(profile?.role ?? '')) {
    return res.status(403).json({ error: 'Only band admins can send invites' });
  }
  if (!profile?.act_id) return res.status(400).json({ error: 'No act linked to account' });

  const { email, role = 'member' } = req.body;
  if (!email) return res.status(400).json({ error: 'Email required' });
  if (!['band_admin', 'member'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  // Check if already a member
  const { data: existing } = await service
    .from('profiles')
    .select('id')
    .eq('email', email)
    .eq('act_id', profile.act_id)
    .maybeSingle();

  if (existing) return res.status(400).json({ error: 'This person is already a member of your act.' });

  const { data: act } = await service
    .from('acts')
    .select('act_name')
    .eq('id', profile.act_id)
    .maybeSingle();

  const actName = act?.act_name || 'your act';

  // Create or refresh invite
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invite, error: inviteError } = await service
    .from('act_invitations')
    .insert({
      act_id:     profile.act_id,
      invited_by: user.id,
      email,
      role,
      expires_at: expiresAt,
    })
    .select('token')
    .single();

  if (inviteError) {
    return res.status(500).json({ error: 'Failed to create invite: ' + inviteError.message });
  }

  const [resendKey, fromEmail, baseUrl] = await Promise.all([
    getSetting('resend_api_key'),
    getSetting('resend_from_email'),
    Promise.resolve(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  ]);

  if (resendKey) {
    const resend = new Resend(resendKey);
    const inviteUrl = `${baseUrl}/join?token=${invite.token}`;
    await resend.emails.send({
      from: fromEmail ? `Camel Ranch Booking <${fromEmail}>` : 'Camel Ranch Booking <no-reply@camelranchbooking.com>',
      to:   email,
      subject: `You've been invited to join ${actName} on Camel Ranch Booking`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; background: #0E1628; color: #F5EDD9; padding: 40px; border-radius: 12px;">
          <h1 style="color: #E8602A; margin-bottom: 1rem;">You're Invited</h1>
          <p>You've been invited to join <strong>${actName}</strong> as a ${role === 'band_admin' ? 'Band Admin' : 'Member'} on Camel Ranch Booking.</p>
          <a href="${inviteUrl}" style="display: inline-block; margin: 2rem 0; padding: 1rem 2rem; background: #E8602A; color: #F5EDD9; border-radius: 8px; text-decoration: none; font-weight: 700;">
            Accept Invitation
          </a>
          <p style="color: #6B8FB5; font-size: 0.85rem;">This invite expires in 7 days. If you didn't expect this email, you can ignore it.</p>
        </div>
      `,
    });
  }

  // Notify the inviting admin that the invite was sent
  await createNotification({
    userId:    user.id,
    actId:     profile.act_id,
    type:      'general',
    message:   `Invite sent to ${email} as ${role === 'band_admin' ? 'Band Admin' : 'Member'}.`,
  });

  return res.status(200).json({ success: true, message: `Invite sent to ${email}` });
}
