import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ── Decrypt password stored by email/settings.ts ──────────────────────────────
export function decrypt(encryptedText: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'utf8').slice(0, 32);
  const [ivHex, encHex] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// ── Load a user's email settings from Supabase ────────────────────────────────
export async function getUserEmailSettings(userId: string) {
  const { data, error } = await supabase
    .from('user_email_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error || !data) throw new Error('No email account connected. Please set up your email in Settings.');
  return data;
}

// ── Build a nodemailer transporter from saved settings ────────────────────────
export async function getTransporter(userId: string) {
  const settings = await getUserEmailSettings(userId);
  const password = decrypt(settings.password_enc);

  const transporter = nodemailer.createTransport({
    host: settings.smtp_host,
    port: settings.smtp_port,
    secure: settings.smtp_port === 465,
    auth: { user: settings.username, pass: password },
    connectionTimeout: 10000,
  });

  return { transporter, settings };
}

// ── Resolve authenticated user from Bearer token ──────────────────────────────
export async function getUserFromToken(authHeader: string | undefined) {
  if (!authHeader) throw new Error('Not authenticated');
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Invalid session');
  return user;
}

// ── Log a sent email to the email_logs table ──────────────────────────────────
export async function logSentEmail(params: {
  userId: string;
  venueId: string;
  campaignId?: string;
  templateId?: string;
  bandId?: string;
  toAddress: string;
  subject: string;
  body: string;
  messageId?: string;
}) {
  await supabase.from('email_logs').insert({
    user_id:     params.userId,
    venue_id:    params.venueId,
    campaign_id: params.campaignId ?? null,
    template_id: params.templateId ?? null,
    band_id:     params.bandId     ?? null,
    direction:   'sent',
    to_address:  params.toAddress,
    subject:     params.subject,
    body:        params.body,
    message_id:  params.messageId ?? null,
    sent_at:     new Date().toISOString(),
  });
}
