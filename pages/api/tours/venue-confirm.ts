import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';

type Platform = 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'discord';

// Genre → platform hashtag clusters for algorithmic reach
const GENRE_HASHTAGS: Record<string, Record<Platform, string>> = {
  country:    { instagram: '#countrymusic #country #countryconcert #countrylife #nashville',     facebook: '#countrymusic #country',           youtube: '#countrymusic',             tiktok: '#countrymusic #countrytiktok #fyp',       discord: '' },
  americana:  { instagram: '#americana #americanamusic #rootsmusic #folk #livemusic',            facebook: '#americana #rootsmusic',           youtube: '#americana #rootsmusic',    tiktok: '#americana #folkmusic #fyp',              discord: '' },
  rock:       { instagram: '#rock #rockmusic #liverock #rockandroll #rockband',                  facebook: '#rockmusic #liverock',             youtube: '#rockmusic #rock',          tiktok: '#rock #rockmusic #fyp #bandtok',          discord: '' },
  'hard rock':{ instagram: '#hardrock #rock #heavyrock #liverock #rockmusic',                    facebook: '#hardrock #rockmusic',             youtube: '#hardrock #rock',           tiktok: '#hardrock #rock #fyp',                    discord: '' },
  metal:      { instagram: '#metal #heavymetal #metalhead #metalmusic #livemetal',               facebook: '#metal #heavymetal #metalmusic',   youtube: '#metal #heavymetal',        tiktok: '#metal #metalcore #fyp #metaltiktok',     discord: '' },
  punk:       { instagram: '#punk #punkrock #punkmusic #livepunk #punkband',                     facebook: '#punkrock #punk',                  youtube: '#punk #punkrock',           tiktok: '#punk #punkrock #fyp',                    discord: '' },
  jazz:       { instagram: '#jazz #jazzmusic #livejazz #jazzband #jazzlive',                    facebook: '#jazz #livejazz',                  youtube: '#jazz #jazzmusic',          tiktok: '#jazz #jazzmusic #fyp #jazztiktok',       discord: '' },
  blues:      { instagram: '#blues #bluesmusic #liveblues #bluesrock #bluesband',               facebook: '#blues #bluesmusic',               youtube: '#blues #bluesmusic',        tiktok: '#blues #bluesmusic #fyp',                 discord: '' },
  folk:       { instagram: '#folk #folkmusic #singersongwriter #acousticmusic #folksongs',       facebook: '#folk #folkmusic',                 youtube: '#folk #folkmusic',          tiktok: '#folk #folkmusic #fyp #acoustictok',      discord: '' },
  pop:        { instagram: '#pop #popmusic #indiepop #livepop #popband',                         facebook: '#pop #popmusic',                   youtube: '#pop #popmusic',            tiktok: '#pop #popmusic #fyp #poptok',             discord: '' },
  'indie pop':{ instagram: '#indiepop #indie #indiemusic #indieband #alternativepop',           facebook: '#indiepop #indie',                 youtube: '#indiepop #indie',          tiktok: '#indiepop #indie #fyp',                   discord: '' },
  'hip-hop':  { instagram: '#hiphop #rap #hiphopmusic #livehiphop #rapper',                     facebook: '#hiphop #rap #hiphopmusic',        youtube: '#hiphop #rap',              tiktok: '#hiphop #rap #fyp #hiphoptiktok',         discord: '' },
  edm:        { instagram: '#edm #electronicmusic #rave #dj #festival',                         facebook: '#edm #electronicmusic #rave',      youtube: '#edm #electronicmusic',    tiktok: '#edm #rave #fyp #edmtiktok',              discord: '' },
  default:    { instagram: '#livemusic #concert #liveconcert #musiclover #supportlivemusic',    facebook: '#livemusic #concert',              youtube: '#livemusic #concert',       tiktok: '#livemusic #concert #fyp #musiclover',    discord: '' },
};

function getGenreTags(genre: string | undefined, platform: Platform): string {
  if (!genre) return GENRE_HASHTAGS.default[platform];
  const key = genre.toLowerCase();
  return GENRE_HASHTAGS[key]?.[platform] ?? GENRE_HASHTAGS.default[platform];
}

const PLATFORM_PROMPTS: Record<Platform, (ctx: {
  actName: string; venueName: string; city: string; state: string;
  dateFormatted: string; fee?: string; genre?: string; genreTags: string;
}) => string> = {

  instagram: ({ actName, venueName, city, state, dateFormatted, fee, genre, genreTags }) =>
    `Write an Instagram post optimized for maximum algorithmic reach announcing a confirmed live show.

Show details:
- Act: ${actName}${genre ? ` — Genre: ${genre}` : ''}
- Venue: ${venueName}, ${city}, ${state}
- Date: ${dateFormatted}
${fee ? `- Admission: $${fee}` : ''}

Platform algorithm rules to follow:
1. Instagram now favors posts where the first line stops the scroll and prompts saves/shares over likes.
2. Write 2–3 punchy sentences in the body. The first sentence must hook immediately (no "We're excited to announce" — be direct and exciting).
3. Carousels and Reels get more reach, but a great caption drives saves. Write copy that makes people want to SAVE this post.
4. After the body, add exactly 10–12 hashtags on a new line. Mix: genre-specific, location, and general live music tags.
5. Seed hashtags: ${genreTags} #livemusic #${city.replace(/\s+/g, '').toLowerCase()} #localmusic #showannouncement
6. Use 2–3 emojis naturally within the body — not at every sentence.

Return ONLY the post body + hashtag block. No explanation.`,

  facebook: ({ actName, venueName, city, state, dateFormatted, fee, genre, genreTags }) =>
    `Write a Facebook post optimized for maximum organic reach announcing a confirmed live show.

Show details:
- Act: ${actName}${genre ? ` — Genre: ${genre}` : ''}
- Venue: ${venueName}, ${city}, ${state}
- Date: ${dateFormatted}
${fee ? `- Admission: $${fee}` : ''}

Platform algorithm rules to follow:
1. Facebook's algorithm rewards "meaningful social interactions" — posts that generate comments and shares, NOT just likes.
2. Write 3–5 sentences. Open with something that sparks curiosity or emotion, not a flat announcement.
3. Include all event details (who, what, where, when${fee ? ', price' : ''}).
4. End with an open question or call-to-action that encourages comments (e.g., "Who's coming?" or "Tag someone who needs to see this!").
5. Do NOT use phrases like "like this post" or "share this" — Facebook penalizes that.
6. Add 3–5 hashtags max at the very end: ${genreTags.split(' ').slice(0, 5).join(' ')}
7. Zero excessive emojis. 1–2 max and only if natural.

Return ONLY the post text. No explanation.`,

  youtube: ({ actName, venueName, city, state, dateFormatted, fee, genre }) =>
    `Write a YouTube Community post optimized for engagement announcing a confirmed live show.

Show details:
- Act: ${actName}${genre ? ` — Genre: ${genre}` : ''}
- Venue: ${venueName}, ${city}, ${state}
- Date: ${dateFormatted}
${fee ? `- Admission: $${fee}` : ''}

Platform algorithm rules to follow:
1. YouTube Community posts are shown to subscribers in the Home feed AND the Community tab. The algorithm amplifies posts with high poll responses, comments, and likes — so end with a question or poll prompt.
2. Open addressed to the audience ("Hey everyone!" energy) to signal familiarity and community.
3. Cover the full event details in 3–4 sentences — YouTube fans expect more detail than Instagram.
4. End with a question to drive comments: "Will you be there?" or "Who's joining us?"
5. Light emoji use is fine. No hashtags needed — they don't work the same on YouTube Community.

Return ONLY the post text. No explanation.`,

  tiktok: ({ actName, venueName, city, state, dateFormatted, genre, genreTags }) =>
    `Write a TikTok caption optimized for the For You Page (FYP) algorithm announcing a confirmed live show.

Show details:
- Act: ${actName}${genre ? ` — Genre: ${genre}` : ''}
- Venue: ${venueName}, ${city}, ${state}
- Date: ${dateFormatted}

Platform algorithm rules to follow:
1. TikTok's FYP algorithm heavily weights watch/read completion rate and early saves/shares. The caption must hook in the FIRST 3 WORDS.
2. Keep the body to 1–2 very short sentences MAX. 80–100 characters ideal for body before hashtags.
3. Then 5–7 hashtags on a new line. ALWAYS include: #fyp #foryou — then genre + location specific tags.
4. Seed hashtags: ${genreTags} #${city.replace(/\s+/g, '').toLowerCase()} #localmusic
5. TikTok rewards niche hashtags over mega-popular ones for reaching the RIGHT audience. Use specific genre tags.
6. 1 emoji max in the body if natural. None in hashtags.

Return ONLY the caption + hashtag block. No explanation.`,

  discord: ({ actName, venueName, city, state, dateFormatted, fee, genre }) =>
    `Write a Discord server announcement for a confirmed live show.

Show details:
- Act: ${actName}${genre ? ` — Genre: ${genre}` : ''}
- Venue: ${venueName}, ${city}, ${state}
- Date: ${dateFormatted}
${fee ? `- Admission: $${fee}` : ''}

Platform rules to follow:
1. Discord is community-driven and chronological, not algorithmic. The goal is to make the community feel like insiders who got the news first.
2. Use Discord markdown: **bold** for key info (act name, venue, date). Don't use @everyone or @here (admins handle that).
3. 3–5 sentences covering all details. Warm and community-focused — these are fans, talk to them like it.
4. End with something that invites community reaction: "Drop a 🙌 if you're going!" or similar.
5. Use 2–4 emojis naturally at the start or in the call-to-action. No excessive emoji chains.
6. No hashtags — they don't function on Discord.

Return ONLY the announcement text with markdown. No explanation.`,
};

const PLATFORM_FALLBACK: Record<Platform, (ctx: {
  actName: string; venueName: string; city: string; state: string; date: string;
}) => string> = {
  instagram: ({ actName, venueName, city, state, date }) =>
    `${actName} just locked in a show at ${venueName} in ${city}, ${state} on ${date}. Save this post — you're going to want to remember this one. 🎵\n\n#livemusic #${city.replace(/\s+/g, '').toLowerCase()} #concert #localmusic #showannouncement #${actName.replace(/\s+/g, '').toLowerCase()}`,
  facebook: ({ actName, venueName, city, state, date }) =>
    `Big news — ${actName} is coming to ${venueName} in ${city}, ${state} on ${date}! All the details are below. Who's already planning to be there? Tag someone who needs to see this!`,
  youtube: ({ actName, venueName, city, state, date }) =>
    `Hey everyone! We've got a show coming up at ${venueName} in ${city}, ${state} on ${date}. Mark your calendars — this one is going to be a great night. Will you be there? Let us know in the comments!`,
  tiktok: ({ actName, city, state, date }) =>
    `${actName} is coming to ${city}, ${state} on ${date} 🔥 Don't miss this.\n\n#fyp #foryou #livemusic #concert #${city.replace(/\s+/g, '').toLowerCase()} #localmusic`,
  discord: ({ actName, venueName, city, state, date }) =>
    `🎵 **Show Announcement!**\n\n**${actName}** is performing live at **${venueName}** in ${city}, ${state} on **${date}**. You heard it here first — drop a 🙌 if you're going and spread the word!`,
};

async function getResendConfig(service: ReturnType<typeof getServiceClient>) {
  if (process.env.RESEND_API_KEY) {
    return { apiKey: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM_EMAIL || 'booking@mail.camelranchbooking.com' };
  }
  const { data } = await service.from('platform_settings').select('key, value').in('key', ['resend_api_key', 'resend_from_email']);
  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value;
  return { apiKey: map['resend_api_key'] || '', from: map['resend_from_email'] || 'booking@mail.camelranchbooking.com' };
}

async function generatePost(
  anthropic: Anthropic,
  platform: Platform,
  promptCtx: Parameters<typeof PLATFORM_PROMPTS[Platform]>[0],
  fallbackCtx: Parameters<typeof PLATFORM_FALLBACK[Platform]>[0],
): Promise<string> {
  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 450,
      messages: [{ role: 'user', content: PLATFORM_PROMPTS[platform](promptCtx) }],
    });
    return ((message.content[0] as any).text || '').trim();
  } catch {
    return PLATFORM_FALLBACK[platform](fallbackCtx);
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  const service = getServiceClient();
  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { tour_venue_id, show_date, fee, platforms } = req.body;
  if (!tour_venue_id || !show_date) return res.status(400).json({ error: 'tour_venue_id and show_date required' });

  const selectedPlatforms: Platform[] = Array.isArray(platforms) && platforms.length > 0
    ? platforms.filter((p: string): p is Platform => ['instagram', 'facebook', 'youtube', 'tiktok', 'discord'].includes(p))
    : ['instagram', 'facebook'];

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
      act_id:     (act as any).id,
      venue_id:   (tv.venue as any).id,
      tour_id:    (tv.tour as any).id,
      status:     'confirmed',
      show_date,
      fee:        fee ? parseFloat(fee) : null,
    }).select('id').single();

    if (bookingError) throw new Error(bookingError.message);

    const dateFormatted = new Date(show_date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
    const dateFallback = new Date(show_date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    const genre = (act as any).genre as string | undefined;

    const fallbackCtx = {
      actName:   (act as any).act_name,
      venueName: (tv.venue as any).name,
      city:      (tv.venue as any).city,
      state:     (tv.venue as any).state,
      date:      dateFallback,
    };

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Generate all platform posts in parallel, each with genre-aware algorithmic prompts
    const postResults = await Promise.allSettled(
      selectedPlatforms.map(platform =>
        generatePost(
          anthropic,
          platform,
          {
            actName:       (act as any).act_name,
            venueName:     (tv.venue as any).name,
            city:          (tv.venue as any).city,
            state:         (tv.venue as any).state,
            dateFormatted,
            fee:           fee || undefined,
            genre,
            genreTags:     getGenreTags(genre, platform),
          },
          fallbackCtx,
        )
      )
    );

    const inserts = selectedPlatforms.map((platform, i) => ({
      booking_id: (booking as any).id,
      act_id:     (act as any).id,
      venue_id:   (tv.venue as any).id,
      platform,
      content:    postResults[i].status === 'fulfilled'
        ? (postResults[i] as PromiseFulfilledResult<string>).value
        : PLATFORM_FALLBACK[platform](fallbackCtx),
      status:    'pending',
      show_date,
    }));

    await service.from('social_queue').insert(inserts);

    // Notify band members
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
                  <tr><td style="padding:0.3rem 0.5rem;font-weight:600">Date</td><td>${dateFormatted}</td></tr>
                  ${fee ? `<tr><td style="padding:0.3rem 0.5rem;font-weight:600">Fee</td><td>$${Number(fee).toLocaleString()}</td></tr>` : ''}
                </table>
                <p style="margin-top:1.5rem">Log in to Camel Ranch Booking for full details.</p>
              </div>`,
            });
          }
        }
      } catch { /* email failures don't block */ }
    }

    return res.status(200).json({ ok: true, booking_id: (booking as any).id, posts_created: inserts.length });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
}
