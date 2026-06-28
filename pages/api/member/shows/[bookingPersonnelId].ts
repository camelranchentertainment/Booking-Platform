import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../../lib/supabase';

const VALID_STATUSES = ['confirmed', 'declined'] as const;
const PAY_FIELDS     = [
  'amount', 'pay_amount', 'default_pay_amount', 'agreed_amount',
  'actual_amount_received', 'payment_status', 'expense', 'fee', 'pay',
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'PATCH') return res.status(405).end();

  const { bookingPersonnelId } = req.query;
  if (typeof bookingPersonnelId !== 'string') {
    return res.status(400).json({ error: 'Invalid id' });
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Reject any pay-related fields before reading anything else
  const body = req.body ?? {};
  const payAttempt = PAY_FIELDS.filter(f => f in body);
  if (payAttempt.length > 0) {
    return res.status(400).json({
      error: `Pay fields are not writable from this route: ${payAttempt.join(', ')}`,
    });
  }

  const { status, notes } = body;

  if (status !== undefined && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({
      error: `status must be one of: ${VALID_STATUSES.join(', ')}`,
    });
  }

  if (status === undefined && notes === undefined) {
    return res.status(400).json({ error: 'Provide status and/or notes to update' });
  }

  // Verify row exists and belongs to the authenticated user.
  // Service client bypasses RLS so ownership must be checked explicitly.
  const { data: row } = await service
    .from('booking_personnel')
    .select('id, act_personnel!booking_personnel_personnel_id_fkey(linked_user_id)')
    .eq('id', bookingPersonnelId)
    .single();

  if (!row) return res.status(404).json({ error: 'Not found' });

  const linkedUserId = (row.act_personnel as any)?.linked_user_id ?? null;
  if (linkedUserId !== user.id) return res.status(403).json({ error: 'Forbidden' });

  // Build safe update — responded_at set server-side whenever status changes
  const update: Record<string, unknown> = {};
  if (status !== undefined) {
    update.status       = status;
    update.responded_at = new Date().toISOString();
  }
  if (notes !== undefined) update.notes = notes;

  const { data: updated, error: updateErr } = await service
    .from('booking_personnel')
    .update(update)
    .eq('id', bookingPersonnelId)
    .select('id, status, notes, responded_at')
    .single();

  if (updateErr) return res.status(500).json({ error: updateErr.message });

  return res.status(200).json({ show: updated });
}
