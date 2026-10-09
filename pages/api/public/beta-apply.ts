// pages/api/public/beta-apply.ts
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { getSetting } from '../../../lib/platformSettings';
import { withHandler, AppError } from '../../../lib/apiError';
import { betaApplicationSchema, fieldErrors, isBetaOpen, type BetaApplication } from '../../../lib/domain/betaProgram';
import { countApprovedBetaApplications } from '../../../lib/server/betaProgram';

/** Postgres unique_violation — a live application already exists for this email. */
const UNIQUE_VIOLATION = '23505';

/**
 * POST /api/public/beta-apply
 * Public, unauthenticated. Records a founding-beta application for Scott to review.
 *
 * Abuse controls: schema validation with length caps, a honeypot field
 * (`companySite`) that real users never see, one live application per email
 * (unique index), and the offer closing once the cap is reached.
 *
 * @returns 201 { ok: true } · 400 validation errors · 409 duplicate or closed
 */
async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  // Honeypot: bots fill every field. Answer as if accepted so they learn nothing.
  if (typeof body.companySite === 'string' && body.companySite.trim() !== '') {
    res.status(201).json({ ok: true });
    return;
  }

  const parsed = betaApplicationSchema.safeParse(body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Please fix the highlighted fields.', fields: fieldErrors(parsed.error) });
    return;
  }
  const app = parsed.data;

  const service = getServiceClient();
  if (!isBetaOpen(await countApprovedBetaApplications(service))) {
    throw new AppError(409, 'The founding beta is full. Thank you for your interest.');
  }

  const { error } = await service.from('beta_applications').insert({
    applicant_name:  app.applicantName,
    email:           app.email,
    act_name:        app.actName,
    genre:           app.genre,
    home_base:       app.homeBase,
    shows_per_year:  app.showsPerYear,
    booking_method:  app.bookingMethod,
    website_url:     app.websiteUrl,
    agent_name:      app.agentName,
    feedback_agreed: app.feedbackAgreed,
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new AppError(409, 'We already have an application from this email. Scott will be in touch soon.');
    }
    throw new AppError(500, 'Could not save the application', false);
  }

  // The application is saved; a failed notification must not fail the request.
  await notifyNewApplication(app).catch(err => console.error('[beta] notification failed', err));

  res.status(201).json({ ok: true });
}

/** Emails the platform inbox about a new application, if Resend is configured. */
async function notifyNewApplication(app: BetaApplication): Promise<void> {
  const apiKey   = await getSetting('resend_api_key');
  const fromAddr = await getSetting('resend_from_email');
  if (!apiKey || !fromAddr) return;

  const rows: [string, string | null][] = [
    ['Name', app.applicantName],
    ['Email', app.email],
    ['Act', app.actName],
    ['Genre', app.genre],
    ['Home base', app.homeBase],
    ['Shows per year', app.showsPerYear],
    ['Books shows today by', app.bookingMethod],
    ['Website', app.websiteUrl],
    ['Agent / manager', app.agentName],
  ];
  const html = `
    <h2 style="font-family:sans-serif;color:#E07820">New founding beta application</h2>
    <table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">
      ${rows.filter(([, v]) => v).map(([k, v]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#888;vertical-align:top;white-space:nowrap">${esc(k)}</td><td>${esc(v ?? '')}</td></tr>`,
      ).join('')}
    </table>
    <p style="font-family:sans-serif;font-size:13px;color:#888">Review it in the superadmin panel.</p>
  `;

  const mailRes = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: fromAddr,
      to: [fromAddr],
      reply_to: app.email,
      subject: `Beta application — ${app.actName}`,
      html,
    }),
  });
  if (!mailRes.ok) throw new Error(`Resend ${mailRes.status}`);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default withHandler(handler);
