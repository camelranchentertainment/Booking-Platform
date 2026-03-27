import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role key — server side only
);

// Encrypt sensitive fields before storing.
// ENCRYPTION_KEY must be a 32-character random string set in your .env.local
function encrypt(text: string): string {
  const key = Buffer.from(process.env.ENCRYPTION_KEY!, 'utf8').slice(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function smtpFromDomain(email: string): string {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (domain === 'gmail.com' || domain === 'googlemail.com') return 'smtp.gmail.com';
  if (domain === 'outlook.com' || domain === 'hotmail.com' || domain === 'live.com') return 'smtp-mail.outlook.com';
  if (domain === 'yahoo.com' || domain === 'yahoo.co.uk') return 'smtp.mail.yahoo.com';
  if (domain === 'icloud.com' || domain === 'me.com') return 'smtp.mail.me.com';
  if (domain === 'protonmail.com' || domain === 'proton.me') return 'smtp.protonmail.com';
  // For custom domains, use their own SMTP
  return `smtp.${domain}`;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Resolve userId: try Supabase Bearer token first, fall back to userId in body
  // (custom-JWT login flow sends userId in body, same pattern as /api/email/send)
  let userId: string;
  try {
    const authHeader = req.headers.authorization;
    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error } = await supabase.auth.getUser(token);
      if (!error && user) {
        userId = user.id;
      } else {
        throw new Error('token invalid');
      }
    } else {
      throw new Error('no header');
    }
  } catch {
    const bodyUserId = req.body?.userId as string | undefined;
    if (!bodyUserId) return res.status(401).json({ error: 'Not authenticated' });
    userId = bodyUserId;
  }

  const {
    provider, displayName, emailAddress,
    smtpHost, smtpPort, imapHost, imapPort,
    username, password,
  } = req.body;

  if (!emailAddress || !password) {
    return res.status(400).json({ error: 'Email address and password are required' });
  }

  // Auto-derive SMTP host/port from email domain if not provided
  const resolvedHost = smtpHost || smtpFromDomain(emailAddress);
  const resolvedPort = smtpPort || '587';
  const resolvedUsername = username || emailAddress;

  try {
    // Encrypt the password before storing — never store plain text credentials
    const encryptedPassword = encrypt(password);

    const { error } = await supabase
      .from('user_email_settings')
      .upsert({
        user_id:          userId,
        provider:         provider || 'smtp',
        display_name:     displayName || '',
        email_address:    emailAddress,
        smtp_host:        resolvedHost,
        smtp_port:        parseInt(resolvedPort),
        imap_host:        imapHost || '',
        imap_port:        parseInt(imapPort) || 993,
        username:         resolvedUsername,
        password_enc:     encryptedPassword,
        updated_at:       new Date().toISOString(),
      }, {
        onConflict: 'user_id', // one row per user — upsert replaces existing
      });

    if (error) throw error;

    return res.status(200).json({ success: true, message: 'Email settings saved' });
  } catch (error: any) {
    console.error('Save email settings error:', error);
    return res.status(500).json({ error: error.message || 'Failed to save settings' });
  }
}
