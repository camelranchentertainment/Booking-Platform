import { getServiceClient } from './supabase';
import type { NotificationType } from './notificationTypes';

export async function createNotification({
  userId, actId, type, message, actionUrl,
}: {
  userId: string;
  actId?: string;
  type: NotificationType;
  message: string;
  actionUrl?: string;
}) {
  const service = getServiceClient();
  const { error } = await service.from('notifications').insert({
    user_id:    userId,
    act_id:     actId || null,
    type,
    message,
    action_url: actionUrl || null,
  });
  // Notifications are best-effort, but a rejected insert must be visible in logs.
  if (error) console.error('[notifications] insert failed', { type, code: error.code });
}

export async function notifyActMembers({
  actId, type, message, actionUrl,
}: {
  actId: string;
  type: NotificationType;
  message: string;
  actionUrl?: string;
}) {
  const service = getServiceClient();
  const { data: members } = await service
    .from('profiles')
    .select('id')
    .eq('act_id', actId);

  if (!members?.length) return;

  const { error } = await service.from('notifications').insert(
    members.map(m => ({
      user_id:    m.id,
      act_id:     actId,
      type,
      message,
      action_url: actionUrl || null,
    }))
  );
  if (error) console.error('[notifications] act insert failed', { type, code: error.code });
}
