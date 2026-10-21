// pages/api/account/delete.ts
//
// DELETE /api/account/delete — self-service account deletion, used by
// Settings on the website and by the iOS/Android app (App Store
// Guideline 5.1.1(v)).
//
// Auth: Bearer access token. The user deleted is ALWAYS the verified caller;
// nothing in the request body or URL can name another account.
//
// Responses:
//   200 { ok: true }                              account deleted
//   401 { error }                                 missing/invalid session
//   403 { error, code: 'SUPERADMIN' }
//   409 { error, code }                           deletion blocked; `error` is
//                                                 a user-facing reason
//   405                                           wrong method
//   500 { error }                                 unexpected failure (Sentry)
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { AppError, withHandler } from '../../../lib/apiError';
import { findDeletionBlocker } from '../../../lib/server/accountDeletion';

/**
 * Deletes the caller's own account after pre-flight checks confirm it will not
 * destroy band data, orphan a band, leave a Stripe subscription billing, or
 * trip a foreign-key error. Deleting the auth user cascades to the profile,
 * memberships, push tokens and per-user settings.
 *
 * @throws AppError 401 when the session is missing or invalid
 * @throws Error when a lookup or the delete itself fails (500 via withHandler)
 */
async function deleteAccount(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    res.status(405).end();
    return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new AppError(401, 'Unauthorized');

  const service = getServiceClient();
  const { data: { user }, error: authErr } = await service.auth.getUser(token);
  if (authErr || !user) throw new AppError(401, 'Unauthorized');

  const blocker = await findDeletionBlocker(service, user.id);
  if (blocker) {
    console.info(JSON.stringify({ event: 'account_delete_blocked', userId: user.id, code: blocker.code }));
    res.status(blocker.status).json({ error: blocker.message, code: blocker.code });
    return;
  }

  const { error: deleteErr } = await service.auth.admin.deleteUser(user.id);
  if (deleteErr) throw new Error(`auth user delete failed: ${deleteErr.message}`);

  console.info(JSON.stringify({ event: 'account_deleted', userId: user.id }));
  res.status(200).json({ ok: true });
}

export default withHandler(deleteAccount);
