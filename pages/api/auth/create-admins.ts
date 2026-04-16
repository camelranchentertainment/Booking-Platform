// pages/api/auth/create-admins.ts
//
// ONE-TIME SETUP ROUTE — Run this once to create all three admin accounts.
//
// HOW TO USE:
//   After deploying, visit this URL in your browser:
//   https://camelranchbooking.com/api/auth/create-admins?secret=YOUR_ADMIN_SEED_SECRET
//
//   Add ADMIN_SEED_SECRET to your Vercel environment variables first.
//   Set it to any long random string — e.g. "CamelRanch2025AdminSetup!"
//   This prevents anyone else from running this route.
//
// AFTER RUNNING:
//   Each admin can log in immediately using the passwords below.
//   They should change passwords via Supabase Dashboard → Authentication → Users
//   or you can add a "change password" feature to the settings page later.
//
// ⚠️  DISABLE THIS ROUTE after first use by deleting the file from GitHub.

import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// ─── Admin accounts to create ─────────────────────────────────────────────────
// ⚠️  REPLACE chris@camelranchbooking.com with Chris Brotherton's real email!
const ADMINS = [
  {
    email:     'scott@camelranchbooking.com',
    password:  'CamelRanch2025!',
    name:      'Scott',
    bandName:  "Better Than Nothin'",
  },
  {
    email:     'chrisbrothertonband@yahoo.com',
    password:  'CamelRanch2025!',
    name:      'Chris Brotherton',
    bandName:  "Better Than Nothin'",
  },
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // ── Guard: require the secret query param ────────────────────────────────────
  const { secret } = req.query;
  if (!process.env.ADMIN_SEED_SECRET || secret !== process.env.ADMIN_SEED_SECRET) {
    return res.status(403).json({ error: 'Forbidden — invalid or missing secret.' });
  }

  const results: Record<string, string> = {};

  for (const admin of ADMINS) {
    try {
      // ── 1. Check if user already exists ──────────────────────────────────────
      const { data: existing } = await supabase.auth.admin.listUsers();
      const users = (existing?.users ?? []) as Array<{ id: string; email?: string }>;
      const alreadyExists = users.find(u => u.email === admin.email);

      let userId: string;

      if (alreadyExists) {
        userId = alreadyExists.id;
        // Update their password to the admin default
        await supabase.auth.admin.updateUserById(userId, {
          password: admin.password,
          email_confirm: true,
        });
        results[admin.email] = 'updated existing user';
      } else {
        // ── 2. Create auth user ─────────────────────────────────────────────────
        const { data: created, error: createError } = await supabase.auth.admin.createUser({
          email:          admin.email,
          password:       admin.password,
          email_confirm:  true,
        });
        if (createError) {
          results[admin.email] = `ERROR creating auth user: ${createError.message}`;
          continue;
        }
        userId = created.user.id;
        results[admin.email] = 'created new user';
      }

      // ── 3. Upsert band_profiles with is_admin = true ──────────────────────────
      const { error: profileError } = await supabase
        .from('band_profiles')
        .upsert({
          id:                userId,
          band_name:         admin.bandName,
          username:          admin.bandName.toLowerCase().replace(/[^a-z0-9]/g, ''),
          subscription_tier: 'premium', // admins get premium for free
          is_admin:          true,
        }, { onConflict: 'id' });

      if (profileError) {
        results[admin.email] += ` | ERROR upserting band_profile: ${profileError.message}`;
        continue;
      }

      // ── 4. Upsert profiles table (used by settings/email components) ──────────
      await supabase
        .from('profiles')
        .upsert({
          id:           userId,
          display_name: admin.name,
          is_admin:     true,
        }, { onConflict: 'id' });

      results[admin.email] += ' ✅ admin profile set';

    } catch (err: unknown) {
      results[admin.email] = `UNEXPECTED ERROR: ${err instanceof Error ? err.message : String(err)}`;
    }
  }

  return res.status(200).json({
    message: '✅ Admin seed complete. DELETE this file from GitHub now!',
    results,
    defaultPassword: 'CamelRanch2025!',
    nextStep: 'Each admin can log in at camelranchbooking.com with the default password above.',
  });
}
