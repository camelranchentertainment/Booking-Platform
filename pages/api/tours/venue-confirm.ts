import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';

async function getResendConfig(service: ReturnType<typeof getServiceClient>) {
  if (process.env.RESEND_API_KEY) {
    return {
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.RESEND_FROM_EMAIL || 'booking@mail.camelranchbooking.com',
    };
  }
  const { data } = await service.from('platform_settings').select('key, value').in('key', ['resend_api_key', 'resend_from_email']);
  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value;
  return {
    apiKey: map['resend_api_key'] || '',
    from: map['resend_from_email'] || 'booking@mail.camelranchbooking.com',
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { tour_venue_id, show_date, fee, platform } = req.body;
  if (!tour_venue_id || !show_date) return res.status(400).json({ error: 'tour_venue_id and show_date required' });

  const { data: tv } = await service
    .from('tour_venues')
    .select('*, tour:tours(id, act_id, name, created_by), venue:venues(id, name, city, state)')
    .eq('id', tour_venue_id)
    .single();

  if (!tv) return res.status(404).json({ error: 'Not found' });
  if ((tv.tour as any).created_by !== user.id) return res.status(403).json({ error: 'Forbidden' });

  const { data: act } = await service
    .from('acts')
    .select('id, act_name, genre, bio')
    .eq('id', (tv.tour as any).act_id)
    .single();

  if (!act) return res.status(404).json({ error: 'Act not found' });

  try {
    await service.from('tour_venues').update({ status: 'confirmed' }).eq('id', tour_venue_id);

    const { data: booking, error: bookingError } = await service.from('bookings').insert({
      created_by: user.id,
      act_id: (act as any).id,
      venue_id: (tv.venue as any).id,
      tour_id: (tv.tour as any).id,
      status: 'confirmed',
      show_date,
      fee: fee ? parseFloat(fee) : null,
    }).select('id').single();

    if (bookingError) throw new Error(bookingError.message);

    let socialContent = '';
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
      const showDateFormatted = new Date(show_date + 'T00:00:00').toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      });

      const message = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 350,
        messages: [{
          role: 'user',
          content: `Write an exciting Instagram/Facebook post announcing a confirmed show.
Act: ${(act as any).act_name}
Venue: ${(tv.venue as any).name}, ${(tv.venue as any).city}, ${(tv.venue as any).state}
Date: ${showDateFormatted}
${fee ? `Admission: $${fee}` : ''}
${(act as any).genre ? `Genre: ${(act as any).genre}` : ''}

Write 2-4 sentences that build excitement. Include relevant hashtags at the end. Keep it energetic and authentic. Return ONLY the post text.`,
        }],
      });

      socialContent = ((message.content[0] as any).text || '').trim();
    } catch {
      const d = new Date(show_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
      socialContent = `Excited to announce ${(act as any).act_name} at ${(tv.venue as any).name} in ${(tv.venue as any).city}, ${(tv.venue as any).state} on ${d}! This is going to be a great night — don't miss it. #LiveMusic #${(act as any).act_name?.replace(/\s+/g, '')}`;
    }

    await service.from('social_queue').insert({
      booking_id: (booking as any).id,
      act_id: (act as any).id,
      venue_id: (tv.venue as any).id,
      platform: platform || 'instagram',
      content: socialContent,
      status: 'pending',
      show_date,
    });

    const { data: members } = await service
      .from('act_members')
      .select('user_id, user_profiles(email, display_name)')
      .eq('act_id', (act as any).id)
      .eq('is_active', true);

    if (members && members.length > 0) {
      try {
        const { apiKey, from } = await getResendConfig(service);
        if (apiKey) {
          const resend = new Resend(apiKey);
          const d = new Date(show_date + 'T00:00:00').toLocaleDateString('en-US', {
            weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
          });

          for (const member of members as any[]) {
            const profile = member.user_profiles;
            if (!profile?.email) continue;
            await resend.emails.send({
              from,
              to: profile.email,
              subject: `New Show Confirmed: ${(act as any).act_name} @ ${(tv.venue as any).name}`,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:1.5rem">
                <h2 style="color:#c49a3c;margin-top:0">New Show Confirmed</h2>
                <p>Hi ${profile.display_name || 'there'},</p>
                <p>A new show has been confirmed for <strong>${(act as any).act_name}</strong>:</p>
                <table style="background:#f8f8f8;border-radius:8px;padding:1rem;width:100%;border-collapse:collapse">
                  <tr><td style="padding:0.3rem 0.5rem;font-weight:600">Venue</td><td>${(tv.venue as any).name}</td></tr>
                  <tr><td style="padding:0.3rem 0.5rem;font-weight:600">Location</td><td>${(tv.venue as any).city}, ${(tv.venue as any).state}</td></tr>
                  <tr><td style="padding:0.3rem 0.5rem;font-weight:600">Date</td><td>${d}</td></tr>
                  ${fee ? `<tr><td style="padding:0.3rem 0.5rem;font-weight:600">Fee</td><td>$${Number(fee).toLocaleString()}</td></tr>` : ''}
                </table>
                <p style="margin-top:1.5rem">Log in to Camel Ranch Booking for full details.</p>
              </div>`,
            });
          }
        }
      } catch { /* email failures don't block the response */ }
    }

    return res.status(200).json({ ok: true, booking_id: (booking as any).id });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
