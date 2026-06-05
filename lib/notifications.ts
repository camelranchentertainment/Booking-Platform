import { getServiceClient } from './supabase';

export async function createNotification({
  userId, actId, type, message, actionUrl,
}: {
  userId: string;
  actId?: string;
  type: string;
  message: string;
  actionUrl?: string;
}) {
  const service = getServiceClient();
  await service.from('notifications').insert({
    user_id:    userId,
    act_id:     actId || null,
    type,
    message,
    action_url: actionUrl || null,
  });
}

export async function notifyActMembers({
  actId, type, message, actionUrl,
}: {
  actId: string;
  type: string;
  message: string;
  actionUrl?: string;
}) {
  const service = getServiceClient();
  const { data: members } = await service
    .from('profiles')
    .select('id')
    .eq('act_id', actId);

  if (!members?.length) return;

  await service.from('notifications').insert(
    members.map(m => ({
      user_id:    m.id,
      act_id:     actId,
      type,
      message,
      action_url: actionUrl || null,
    }))
  );
}
