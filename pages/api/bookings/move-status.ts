import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import { updateBookingStatus } from '../../../lib/statusSync';
import type { BookingStatus } from '../../../lib/types';
import { AppError, withHandler } from '../../../lib/apiError';

export default withHandler(async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') throw new AppError(405, 'Method not allowed');

  const { bookingId, status } = req.body;
  if (!bookingId || !status) throw new AppError(400, 'bookingId and status required');

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) throw new AppError(401, 'Unauthorized');

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) throw new AppError(401, 'Unauthorized');

  await updateBookingStatus(service, bookingId, status as BookingStatus);
  return res.status(200).json({ ok: true });
});
