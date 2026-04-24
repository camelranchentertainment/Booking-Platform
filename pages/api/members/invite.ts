import { NextApiRequest, NextApiResponse } from 'next';
import { Resend } from 'resend';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end();

  const token = req.headers.authorization?.replace('Bearer ', '');
  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token || '');
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { actId, email, role } = req.body;
  if (!actId || !email || !role) return res.status(400).json({ error: 'actId, email, role required' });
  if (!['act_admin', 'member', 'agent'].includes(role)) return res.status(400).json({ error: 'Invalid role' });

  // Get act name, inviter display name, and current admin count
  const [actRes, profileRes, currentAdminsRes, pendingAdminsRes] = await Promise.all([
    service.from('acts').select('act_name').eq('id', actId).single(),
    service.from('user_profiles').select('display_name, agency_name').eq('id', user.id).maybeSingle(),
    service.from('user_profiles').select('id', { count: 'exact', head: true }).eq('act_id', actId).eq('role', 'act_admin'),
    service.from('act_invitations').select('id', { count: 'exact', head: true }).eq('act_id', actId).eq('role', 'act_admin').eq('status', 'pending'),
  ]);
  const actName     = actRes.data?.act_name || 'a band';
  const inviterName = profileRes.data?.agency_name || profileRes.data?.display_name || user.email || 'Someone';

  // Enforce 2-admin limit
  if (role === 'act_admin') {
    const adminCount = (currentAdminsRes.count || 0) + (pendingAdminsRes.count || 0);
    if (adminCount >= 2) return res.status(400).json({ error: 'Maximum of 2 admins allowed per band.' });
  }

  // Create the invite record
  const { data: invite, error: inviteErr } = await service
    .from('act_invitations')
    .insert({
      act_id:     actId,
      email:      email.trim().toLowerCase(),
      role,
      invited_by: user.id,
    })
    .select('token')
    .single();

  if (inviteErr) return res.status(500).json({ error: inviteErr.message });

  const joinUrl   = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://camelranchbooking.com'}/join?token=${invite.token}`;
  const roleLabel = role === 'act_admin' ? 'Band Admin' : role === 'agent' ? 'Booking Agent' : 'Band Member';

  const isAgent = role === 'agent';
  const emailSubject = isAgent
    ? `${inviterName} wants you to manage bookings for ${actName}`
    : `You've been invited to join ${actName} on Camel Ranch Booking`;

  const emailBody = isAgent ? `
    <div style="padding: 32px; background: #ffffff;">
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #1a1a2e;">Booking Agent Invitation</h2>
      <p style="color: #555; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
        <strong>${inviterName}</strong> has invited you to become the <strong>Booking Agent</strong>
        for <strong>${actName}</strong> on Camel Ranch Booking.
      </p>
      <p style="color: #555; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
        As their booking agent you'll have full access to manage their shows, tours, venue outreach,
        and email pipeline — all in one place.
      </p>

      <div style="background: #f8f6f0; border-radius: 8px; padding: 20px 24px; margin-bottom: 28px; text-align: center;">
        <div style="font-size: 18px; font-weight: 700; color: #1a1a2e; letter-spacing: 0.05em;">${actName}</div>
        <div style="font-size: 13px; color: #c8921a; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px;">Booking Agent</div>
      </div>

      <div style="text-align: center; margin-bottom: 28px;">
        <a href="${joinUrl}"
          style="display: inline-block; background: #f5a623; color: #000; font-weight: 700; font-size: 15px;
                 padding: 14px 36px; border-radius: 6px; text-decoration: none; letter-spacing: 0.05em;">
          Accept &amp; Start Booking →
        </a>
      </div>

      <p style="color: #999; font-size: 13px; margin: 0; line-height: 1.6; text-align: center;">
        Sign in with your existing agent account or create a new one.<br>
        This invite expires in 7 days.
      </p>
    </div>
  ` : `
    <div style="padding: 32px; background: #ffffff;">
      <h2 style="margin: 0 0 8px; font-size: 20px; color: #1a1a2e;">You've been invited!</h2>
      <p style="color: #555; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
        <strong>${inviterName}</strong> has invited you to join <strong>${actName}</strong>
        as a <strong>${roleLabel}</strong> on Camel Ranch Booking.
      </p>

      <div style="background: #f8f6f0; border-radius: 8px; padding: 20px 24px; margin-bottom: 28px; text-align: center;">
        <div style="font-size: 18px; font-weight: 700; color: #1a1a2e; letter-spacing: 0.05em;">${actName}</div>
        <div style="font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px;">${roleLabel}</div>
      </div>

      <div style="text-align: center; margin-bottom: 28px;">
        <a href="${joinUrl}"
          style="display: inline-block; background: #f5a623; color: #000; font-weight: 700; font-size: 15px;
                 padding: 14px 36px; border-radius: 6px; text-decoration: none; letter-spacing: 0.05em;">
          Accept Invitation →
        </a>
      </div>

      <p style="color: #999; font-size: 13px; margin: 0; line-height: 1.6; text-align: center;">
        Create a new account or sign in with your existing account.<br>
        This invite expires in 7 days.
      </p>
    </div>
  `;

  // Send the invite email
  const [apiKey, fromEmail] = await Promise.all([
    getSetting('resend_api_key'),
    getSetting('resend_from_email'),
  ]);

  if (apiKey) {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from:    fromEmail || 'bookings@camelranchbooking.com',
      to:      email.trim().toLowerCase(),
      subject: emailSubject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a2e;">
          <div style="background: #1a1a2e; padding: 28px 32px; text-align: center;">
            <div style="font-size: 22px; font-weight: 700; letter-spacing: 0.15em; color: #f5a623;">CAMEL RANCH BOOKING</div>
          </div>
          ${emailBody}
          <div style="padding: 16px 32px; text-align: center; font-size: 12px; color: #aaa;">
            Camel Ranch Booking · <a href="https://camelranchbooking.com" style="color: #aaa;">camelranchbooking.com</a>
          </div>
        </div>
      `,
    });
  }

  return res.status(200).json({ ok: true, emailSent: !!apiKey });
}
