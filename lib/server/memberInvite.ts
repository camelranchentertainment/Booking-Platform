// lib/server/memberInvite.ts
//
// Creates a band invitation and emails the join link. Shared by the Members
// page (/api/members/invite) and the agent's approval step ('member_invite').
// Callers must already have checked the inviter is an admin of `actId`.
import type { SupabaseClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { getSetting } from '../platformSettings';

export type InviteRole = 'band_admin' | 'member';

/** Escapes text for safe use inside HTML email markup. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Normalises an invite email; returns '' when it isn't a plausible address. */
export function normalizeInviteEmail(raw: unknown): string {
  const e = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254 ? e : '';
}

/**
 * Builds the invitation email HTML. Every interpolated value is escaped so a
 * band or inviter name can't inject markup or links. Exported for tests.
 */
export function buildInviteEmailHtml(opts: { inviterName: string; actName: string; role: InviteRole; joinUrl: string }): string {
  const inviter = escapeHtml(opts.inviterName);
  const act = escapeHtml(opts.actName);
  const roleLabel = opts.role === 'band_admin' ? 'Band Admin' : 'Band Member';
  const url = escapeHtml(opts.joinUrl);
  return `
        <div style="font-family: Arial, sans-serif; max-width: 520px; margin: 0 auto; color: #1a1a2e;">
          <div style="background: #1a1a2e; padding: 28px 32px; text-align: center;">
            <div style="font-size: 22px; font-weight: 700; letter-spacing: 0.15em; color: #f5a623;">CAMEL RANCH BOOKING</div>
          </div>
          <div style="padding: 32px; background: #ffffff;">
            <h2 style="margin: 0 0 8px; font-size: 20px; color: #1a1a2e;">You've been invited!</h2>
            <p style="color: #555; margin: 0 0 24px; font-size: 15px; line-height: 1.6;">
              <strong>${inviter}</strong> has invited you to join <strong>${act}</strong>
              as a <strong>${roleLabel}</strong> on Camel Ranch Booking.
            </p>
            <div style="background: #f8f6f0; border-radius: 8px; padding: 20px 24px; margin-bottom: 28px; text-align: center;">
              <div style="font-size: 18px; font-weight: 700; color: #1a1a2e; letter-spacing: 0.05em;">${act}</div>
              <div style="font-size: 13px; color: #888; text-transform: uppercase; letter-spacing: 0.1em; margin-top: 4px;">${roleLabel}</div>
            </div>
            <div style="text-align: center; margin-bottom: 28px;">
              <a href="${url}"
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
          <div style="padding: 16px 32px; text-align: center; font-size: 12px; color: #aaa;">
            Camel Ranch Booking · <a href="https://camelranchbooking.com" style="color: #aaa;">camelranchbooking.com</a>
          </div>
        </div>`;
}

export class InviteError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'InviteError';
  }
}

/**
 * Refuses an invite when the address is already on the band or already has a
 * pending invite. Used before staging (agent) and before creating (both paths).
 *
 * @throws InviteError (400) with a user-facing message
 */
export async function assertInvitable(service: SupabaseClient, actId: string, email: string): Promise<void> {
  const [memberRes, pendingRes] = await Promise.all([
    service.from('profiles').select('id').eq('act_id', actId).ilike('email', email).limit(1),
    service.from('act_invitations').select('id').eq('act_id', actId).ilike('email', email).eq('status', 'pending').limit(1),
  ]);
  if (memberRes.error || pendingRes.error) throw new InviteError(500, 'Could not check existing members');
  if ((memberRes.data ?? []).length > 0) throw new InviteError(400, `${email} is already on this band.`);
  if ((pendingRes.data ?? []).length > 0) throw new InviteError(400, `${email} already has a pending invite.`);
}

/**
 * Creates the invitation (enforcing the 2-admin limit) and sends the email.
 *
 * @returns whether the email was actually sent (false when Resend isn't configured)
 * @throws InviteError on validation or database failure
 */
export async function createAndSendInvite(
  service: SupabaseClient,
  opts: { actId: string; inviterId: string; inviterName: string; email: string; role: InviteRole; personnelId?: string | null },
): Promise<{ emailSent: boolean }> {
  const email = normalizeInviteEmail(opts.email);
  if (!email) throw new InviteError(400, "That email address doesn't look right.");
  const role: InviteRole = opts.personnelId ? 'member' : opts.role;

  const [actRes, adminsRes, pendingAdminsRes] = await Promise.all([
    service.from('acts').select('act_name').eq('id', opts.actId).single(),
    service.from('profiles').select('id', { count: 'exact', head: true }).eq('act_id', opts.actId).eq('role', 'band_admin'),
    service.from('act_invitations').select('id', { count: 'exact', head: true }).eq('act_id', opts.actId).eq('role', 'band_admin').eq('status', 'pending'),
  ]);
  if (role === 'band_admin' && (adminsRes.count || 0) + (pendingAdminsRes.count || 0) >= 2) {
    throw new InviteError(400, 'Maximum of 2 admins allowed per band.');
  }
  const actName = (actRes.data as { act_name?: string } | null)?.act_name || 'a band';

  const { data: invite, error } = await service
    .from('act_invitations')
    .insert({ act_id: opts.actId, email, role, invited_by: opts.inviterId, ...(opts.personnelId ? { personnel_id: opts.personnelId } : {}) })
    .select('token')
    .single();
  if (error || !invite) throw new InviteError(500, error?.message || 'Could not create the invite');

  const joinUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://camelranchbooking.com'}/join?token=${encodeURIComponent((invite as { token: string }).token)}`;
  const [apiKey, fromEmail] = await Promise.all([getSetting('resend_api_key'), getSetting('resend_from_email')]);
  if (!apiKey) return { emailSent: false };

  await new Resend(apiKey).emails.send({
    from: fromEmail || 'booking@mail.camelranchbooking.com',
    to: email,
    subject: `You've been invited to join ${actName.replace(/[\r\n]+/g, ' ')} on Camel Ranch Booking`,
    html: buildInviteEmailHtml({ inviterName: opts.inviterName, actName, role, joinUrl }),
  });
  return { emailSent: true };
}
