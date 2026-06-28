#!/usr/bin/env bash
# Verifies that the two invite-fix files in the live repo match exactly
# what was intended. Run from the repo root in the Codespace.
# Prints only a short pass/fail summary per file plus a unified diff if
# anything differs, so the result is small enough to retype by hand if needed.

set -euo pipefail

EXPECTED_DIR=$(mktemp -d)

cat > "$EXPECTED_DIR/confirm-invited-user.ts" << 'EXPECTED_EOF_1'
import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../lib/supabase';

/**
 * POST /api/auth/confirm-invited-user
 * Body: { token: string }
 *
 * Why this exists:
 * join.tsx calls supabase.auth.signUp() client-side. With "Confirm email"
 * enabled at the Supabase project level, signUp() creates the auth.users
 * row but returns session: null until the user clicks a separate
 * confirmation email — a redundant second verification step, since the
 * invite link itself already proves email ownership (accept-invite.ts
 * separately checks invite.email === user.email before doing anything).
 *
 * This endpoint force-confirms the just-created user's email server-side,
 * authorized by the invite token alone (not a bearer session, since the
 * client has no session yet — that's exactly the problem being solved).
 * It does NOT touch profiles, act_id, or act_personnel — that work stays
 * entirely inside accept-invite.ts, called by the client immediately after
 * this confirms and the client successfully signs in.
 *
 * Security: the invite token is the authorization. We only ever confirm
 * the email address on the invitation row, scoped to a still-pending,
 * unexpired invite — never an arbitrary email supplied by the request body.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { token } = req.body as { token?: string };
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'token required' });
  }

  const supabase = getServiceClient();

  const { data: invite } = await supabase
    .from('act_invitations')
    .select('email, status, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (!invite) return res.status(404).json({ error: 'Invalid invite' });
  if (invite.status !== 'pending') return res.status(410).json({ error: 'This invite has already been used.' });
  if (new Date(invite.expires_at) < new Date()) return res.status(410).json({ error: 'This invite has expired.' });

  // Find the just-created auth user by the invite's email — not by any
  // user-supplied id, to avoid trusting client input for identity lookup.
  const { data: usersPage, error: listErr } = await supabase.auth.admin.listUsers();
  if (listErr) {
    console.error('confirm-invited-user listUsers error:', listErr);
    return res.status(500).json({ error: 'Failed to locate account' });
  }

  const matchedUser = usersPage.users.find(
    (u) => u.email?.toLowerCase() === invite.email.toLowerCase()
  );

  if (!matchedUser) {
    return res.status(404).json({ error: 'No account found for this invite yet. Please sign up first.' });
  }

  if (matchedUser.email_confirmed_at) {
    // Already confirmed (e.g., user retried) — nothing to do, not an error.
    return res.status(200).json({ ok: true, alreadyConfirmed: true });
  }

  const { error: confirmErr } = await supabase.auth.admin.updateUserById(matchedUser.id, {
    email_confirm: true,
  });

  if (confirmErr) {
    console.error('confirm-invited-user updateUserById error:', confirmErr);
    return res.status(500).json({ error: 'Failed to confirm account' });
  }

  return res.status(200).json({ ok: true, alreadyConfirmed: false });
}
EXPECTED_EOF_1

cat > "$EXPECTED_DIR/handleSubmit.tsx" << 'EXPECTED_EOF_2'
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    let accessToken: string;

    if (mode === 'register') {
      const { data, error: err } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { role: invite?.role || 'member' } },
      });
      if (err) { setError(err.message); setSaving(false); return; }
      if (!data.user) { setError('Registration failed'); setSaving(false); return; }

      if (data.session) {
        // Confirm-email is off, or this project allows immediate sessions.
        accessToken = data.session.access_token;
      } else {
        // Confirm-email is on — signUp() created the user but withheld a
        // session pending email confirmation. The invite link itself is
        // sufficient proof of email ownership (accept-invite.ts re-checks
        // invite.email === user.email regardless), so we force-confirm
        // server-side using the invite token as authorization, then sign in.
        const confirmRes = await fetch('/api/auth/confirm-invited-user', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        const confirmResult = await confirmRes.json();
        if (!confirmRes.ok) {
          setError(confirmResult.error || 'Failed to confirm account');
          setSaving(false);
          return;
        }

        const { data: signInData, error: signInErr } = await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });
        if (signInErr || !signInData.session) {
          setError(signInErr?.message || 'Account created, but automatic sign-in failed. Please use "Sign In" above.');
          setSaving(false);
          return;
        }
        accessToken = signInData.session.access_token;
      }
    } else {
      const { data, error: err } = await supabase.auth.signInWithPassword({ email: form.email, password: form.password });
      if (err) { setError(err.message); setSaving(false); return; }
      if (!data.session) { setError('Sign in failed'); setSaving(false); return; }
      accessToken = data.session.access_token;
    }

    // Accept invite via API
    const res = await fetch('/api/accept-invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ token, displayName: form.displayName }),
    });
    const result = await res.json();
    if (!res.ok) { setError(result.error || 'Failed to accept invite'); setSaving(false); return; }

    const role = invite?.role;
    if (role === 'band_admin') router.replace('/band');
    else router.replace('/member');
  };
EXPECTED_EOF_2

echo "========================================"
echo "FILE 1: pages/api/auth/confirm-invited-user.ts"
echo "========================================"
if [ ! -f "pages/api/auth/confirm-invited-user.ts" ]; then
  echo "RESULT: MISSING — file does not exist on disk"
else
  if diff -q "pages/api/auth/confirm-invited-user.ts" "$EXPECTED_DIR/confirm-invited-user.ts" > /dev/null 2>&1; then
    echo "RESULT: IDENTICAL"
  else
    echo "RESULT: DIFFERS — showing diff (< expected, > actual on disk):"
    diff "$EXPECTED_DIR/confirm-invited-user.ts" "pages/api/auth/confirm-invited-user.ts" || true
  fi
fi

echo ""
echo "========================================"
echo "FILE 2: pages/join.tsx (handleSubmit function only)"
echo "========================================"
if [ ! -f "pages/join.tsx" ]; then
  echo "RESULT: MISSING — pages/join.tsx does not exist on disk"
else
  # Extract just the handleSubmit function from the live file for comparison
  sed -n '/const handleSubmit = async/,/^  };$/p' "pages/join.tsx" > "$EXPECTED_DIR/actual_handleSubmit.tsx"
  if diff -q "$EXPECTED_DIR/actual_handleSubmit.tsx" "$EXPECTED_DIR/handleSubmit.tsx" > /dev/null 2>&1; then
    echo "RESULT: IDENTICAL"
  else
    echo "RESULT: DIFFERS — showing diff (< expected, > actual on disk):"
    diff "$EXPECTED_DIR/handleSubmit.tsx" "$EXPECTED_DIR/actual_handleSubmit.tsx" || true
  fi
fi

echo ""
echo "========================================"
echo "DONE — copy everything above this line back to Claude.ai chat"
echo "========================================"

rm -rf "$EXPECTED_DIR"
