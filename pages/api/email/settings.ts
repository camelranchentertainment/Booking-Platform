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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Get the authenticated user from the session cookie
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Not authenticated' });

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: 'Invalid session' });

  const {
    provider, displayName, emailAddress,
    smtpHost, smtpPort, imapHost, imapPort,
    username, password,
  } = req.body;

  if (!smtpHost || !username || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Encrypt the password before storing — never store plain text credentials
    const encryptedPassword = encrypt(password);

    const { error } = await supabase
      .from('user_email_settings')
      .upsert({
        user_id:          user.id,
        provider,
        display_name:     displayName,
        email_address:    emailAddress,
        smtp_host:        smtpHost,
        smtp_port:        parseInt(smtpPort),
        imap_host:        imapHost,
        imap_port:        parseInt(imapPort),
        username,
        password_enc:     encryptedPassword, // encrypted AES-256
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
