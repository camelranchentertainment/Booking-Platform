import { NextApiRequest, NextApiResponse } from 'next';
import { getServiceClient } from '../../../lib/supabase';
import Anthropic from '@anthropic-ai/sdk';
import { Resend } from 'resend';

type Platform = 'instagram' | 'facebook' | 'youtube' | 'tiktok' | 'discord';

// ─── Hashtag strategy: three layered tiers ───────────────────────────────────
// 1. Genre tags  — reaches existing fans of that music style (national/global)
// 2. Location tags — reaches people in or following that city/state (locals + tourists)
// 3. Audience interest tags — genre fan communities + social discovery circles
//    (date night crowd, weekend planners, friends-of-fans who get dragged along)

// Tier 1: Genre → platform hashtag clusters
const GENRE_HASHTAGS: Record<string, Record<Platform, string[]>> = {
  country:      { instagram: ['#countrymusic','#country','#countryconcert','#countrylife','#countryband'],       facebook: ['#countrymusic','#country'],              youtube: ['#countrymusic'],                  tiktok: ['#countrymusic','#countrytiktok'],       discord: [] },
  americana:    { instagram: ['#americana','#americanamusic','#rootsmusic','#singersongwriter'],                  facebook: ['#americana','#rootsmusic'],              youtube: ['#americana','#rootsmusic'],       tiktok: ['#americana','#folkmusic'],             discord: [] },
  rock:         { instagram: ['#rock','#rockmusic','#liverock','#rockandroll','#rockband'],                       facebook: ['#rockmusic','#liverock'],                youtube: ['#rockmusic'],                     tiktok: ['#rock','#rockmusic','#bandtok'],        discord: [] },
  'hard rock':  { instagram: ['#hardrock','#rock','#heavyrock','#liverock','#rockmusic'],                         facebook: ['#hardrock','#rockmusic'],                youtube: ['#hardrock'],                      tiktok: ['#hardrock','#rock'],                   discord: [] },
  metal:        { instagram: ['#metal','#heavymetal','#metalhead','#metalmusic','#livemetal'],                    facebook: ['#metal','#heavymetal'],                  youtube: ['#metal','#heavymetal'],           tiktok: ['#metal','#metalcore','#metaltiktok'],  discord: [] },
  punk:         { instagram: ['#punk','#punkrock','#punkmusic','#livepunk'],                                      facebook: ['#punkrock','#punk'],                     youtube: ['#punk'],                          tiktok: ['#punk','#punkrock'],                   discord: [] },
  jazz:         { instagram: ['#jazz','#jazzmusic','#livejazz','#jazzband'],                                     facebook: ['#jazz','#livejazz'],                     youtube: ['#jazz','#jazzmusic'],             tiktok: ['#jazz','#jazzmusic','#jazztiktok'],    discord: [] },
  blues:        { instagram: ['#blues','#bluesmusic','#liveblues','#bluesrock'],                                  facebook: ['#blues','#bluesmusic'],                  youtube: ['#blues'],                         tiktok: ['#blues','#bluesmusic'],                discord: [] },
  folk:         { instagram: ['#folk','#folkmusic','#singersongwriter','#acousticmusic'],                         facebook: ['#folk','#folkmusic'],                    youtube: ['#folk'],                          tiktok: ['#folk','#folkmusic','#acoustictok'],   discord: [] },
  pop:          { instagram: ['#pop','#popmusic','#livepop','#popband'],                                          facebook: ['#pop','#popmusic'],                      youtube: ['#pop'],                           tiktok: ['#pop','#popmusic','#poptok'],          discord: [] },
  'indie pop':  { instagram: ['#indiepop','#indie','#indiemusic','#indieband'],                                   facebook: ['#indiepop','#indie'],                    youtube: ['#indiepop'],                      tiktok: ['#indiepop','#indie'],                  discord: [] },
  'hip-hop':    { instagram: ['#hiphop','#rap','#hiphopmusic','#livehiphop'],                                     facebook: ['#hiphop','#rap'],                        youtube: ['#hiphop','#rap'],                 tiktok: ['#hiphop','#rap','#hiphoptiktok'],      discord: [] },
  edm:          { instagram: ['#edm','#electronicmusic','#rave','#dj','#festival'],                               facebook: ['#edm','#electronicmusic'],               youtube: ['#edm'],                           tiktok: ['#edm','#rave','#edmtiktok'],           discord: [] },
  default:      { instagram: ['#livemusic','#concert','#liveconcert','#musiclover'],                              facebook: ['#livemusic','#concert'],                 youtube: ['#livemusic'],                     tiktok: ['#livemusic','#concert'],              discord: [] },
};

// Tier 2: Location tags — city/state discovery (locals + people who follow a city)
function getLocationTags(city: string, state: string, platform: Platform): string[] {
  const c = city.replace(/[\s-]+/g, '').toLowerCase();
  const s = state.replace(/[\s-]+/g, '').toLowerCase();
  const tags: Record<Platform, string[]> = {
    instagram: [
      `#${c}`,
      `#${c}music`,
      `#${c}concerts`,
      `#${c}events`,
      `#${c}nightlife`,
      `#${c}entertainment`,
      `#${s}music`,
      `#livemusic${c}`,
      `#${c}thingstodo`,
    ],
    facebook: [
      `#${c}`,
      `#${c}events`,
      `#${c}entertainment`,
      `#${s}`,
    ],
    youtube: [],
    tiktok: [
      `#${c}`,
      `#${c}tiktok`,
      `#${s}`,
    ],
    discord: [],
  };
  return tags[platform];
}

// Tier 3: Audience interest tags — genre fan communities + social discovery circles
// Targets: fans of the music + their friends who get brought along (date night, group night out, weekend planners)
const AUDIENCE_TAGS: Record<string, Record<Platform, string[]>> = {
  country:    { instagram: ['#countryfan','#countrylife','#countrygirl','#countryboy'],   facebook: ['#countryfan','#countrylife'],  youtube: [], tiktok: ['#countryfan','#countrylife'],   discord: [] },
  americana:  { instagram: ['#americanafan','#rootsmusic','#folkfan'],                    facebook: ['#folkfan','#rootsmusic'],      youtube: [], tiktok: ['#folkfan'],                     discord: [] },
  rock:       { instagram: ['#rockfan','#rocklife','#rocknroll','#concertlife'],          facebook: ['#rockfan','#concertlife'],     youtube: [], tiktok: ['#rockfan','#concertlife'],      discord: [] },
  'hard rock':{ instagram: ['#rockfan','#hardrocklover','#concertlife'],                  facebook: ['#rockfan','#concertlife'],     youtube: [], tiktok: ['#rockfan'],                     discord: [] },
  metal:      { instagram: ['#metalhead','#metalfan','#metalcommunity','#metallife'],     facebook: ['#metalhead','#metalfan'],      youtube: [], tiktok: ['#metalhead','#metalfan'],       discord: [] },
  punk:       { instagram: ['#punkfan','#punklife','#punksubculture'],                    facebook: ['#punkfan','#punklife'],        youtube: [], tiktok: ['#punkfan','#punklife'],         discord: [] },
  jazz:       { instagram: ['#jazzlover','#jazzfan','#jazzlife','#smoothjazz'],          facebook: ['#jazzlover','#jazzfan'],       youtube: [], tiktok: ['#jazzlover','#jazzfan'],        discord: [] },
  blues:      { instagram: ['#bluesfan','#blueslover','#blueslife'],                     facebook: ['#bluesfan','#blueslover'],     youtube: [], tiktok: ['#bluesfan'],                    discord: [] },
  folk:       { instagram: ['#folkfan','#acousticfan','#singersongwriterfan'],            facebook: ['#folkfan','#acousticmusic'],   youtube: [], tiktok: ['#folkfan','#acousticfan'],     discord: [] },
  pop:        { instagram: ['#popfan','#musicfan','#poplife'],                            facebook: ['#popfan','#musicfan'],         youtube: [], tiktok: ['#popfan','#musicfan'],          discord: [] },
  'indie pop':{ instagram: ['#indiefan','#indiemusician','#alternativemusic'],            facebook: ['#indiefan','#alternativemusic'],youtube:[], tiktok: ['#indiefan'],                   discord: [] },
  'hip-hop':  { instagram: ['#hiphopfan','#rapfan','#hiphophead','#hiphoplife'],         facebook: ['#hiphopfan','#rapfan'],        youtube: [], tiktok: ['#hiphopfan','#rapfan'],         discord: [] },
  edm:        { instagram: ['#edmfamily','#ravefam','#festivalfam','#edmlife'],           facebook: ['#edmfamily','#ravefam'],       youtube: [], tiktok: ['#edmfamily','#ravefam'],        discord: [] },
  default:    { instagram: ['#musicfan','#concertfan','#musiclover'],                    facebook: ['#musicfan','#musiclover'],     youtube: [], tiktok: ['#musicfan'],                    discord: [] },
};

// Social-circle/discovery tags: people looking for something to do + friends-of-fans
const SOCIAL_DISCOVERY_TAGS: Record<Platform, string[]> = {
  instagram: ['#datenight','#weekendplans','#concertnight','#liveentertainment','#nightout','#supportlivemusic','#concertlife'],
  facebook:  ['#weekendplans','#datenight','#localevents','#thingstodo','#nightout'],
  youtube:   [],
  tiktok:    ['#concertlife','#weekendvibes','#datenight'],
  discord:   [],
};

function buildHashtagBlock(
  platform: Platform,
  genre: string | undefined,
  city: string,
  state: string,
  maxTags: number,
): string {
  const key = genre?.toLowerCase() ?? 'default';
  const genreTags   = GENRE_HASHTAGS[key]?.[platform]    ?? GENRE_HASHTAGS.default[platform];
  const locationTags = getLocationTags(city, state, platform);
  const audienceTags = AUDIENCE_TAGS[key]?.[platform]    ?? AUDIENCE_TAGS.default[platform];
  const socialTags   = SOCIAL_DISCOVERY_TAGS[platform];

  // Interleave tiers so every category is represented, up to maxTags
  const all: string[] = [];
  const pools = [genreTags, locationTags, audienceTags, socialTags];
  let i = 0;
  while (all.length < maxTags) {
    const pool = pools[i % pools.length];
    const tag = pool[Math.floor(i / pools.length)];
    if (tag && !all.includes(tag)) all.push(tag);
    i++;
    if (i > maxTags * 6) break; // safety exit
  }
  return all.slice(0, maxTags).join(' ');
}

const PLATFORM_PROMPTS: Record<Platform, (ctx: {
  actName: string; venueName: string; city: string; state: string;
  dateFormatted: string; fee?: string; genre?: string;
  genreTags: string; locationTags: string; audienceTags: string;
}) => string> = {

  instagram: ({ actName, venueName, city, state, dateFormatted, fee, genre, genreTags, locationTags, audienceTags }) =>
    `Write an Instagram post optimized for maximum algorithmic reach announcing a confirmed live show.

Show details:
- Act: ${actName}${genre ? ` — Genre: ${genre}` : ''}
- Venue: ${venueName}, ${city}, ${state}
- Date: ${dateFormatted}
${fee ? `- Admission: $${fee}` : ''}

Platform algorithm rules to follow:
1. Instagram favors saves and shares over likes. The first line must STOP THE SCROLL — be direct and exciting, never "We're excited to announce".
2. Write 2–3 punchy sentences. Make people want to SAVE this post to show their friends.
3. After the body, add exactly 14–16 hashtags on a new line using ALL THREE of these layers:
   Layer A — Genre fans (people who follow this music style): ${genreTags}
   Layer B — Location discovery (locals + city followers): ${locationTags}
   Layer C — Social circles + discovery (date nights, weekend planners, friends-of-fans): ${audienceTags}
4. Use 2–3 emojis naturally within the body — not at every sentence.

The hashtag strategy targets THREE distinct audiences: existing genre fans nationally, locals in ${city} who follow city tags, and the broader social-discovery crowd (date nights, weekend plans) who may not know the act yet but will come if their friends drag them.

Return ONLY the post body + hashtag block. No explanation.`,

  facebook: ({ actName, venueName, city, state, dateFormatted, fee, genre, genreTags, locationTags, audienceTags }) =>
    `Write a Facebook post optimized for maximum organic reach announcing a confirmed live show.

Show details:
- Act: ${actName}${genre ? ` — Genre: ${genre}` : ''}
- Venue: ${venueName}, ${city}, ${state}
- Date: ${dateFormatted}
${fee ? `- Admission: $${fee}` : ''}

Platform algorithm rules to follow:
1. Facebook's algorithm rewards "meaningful social interactions" — comments and shares, NOT likes.
2. Write 3–5 sentences. Open with something that sparks curiosity or emotion, not a flat announcement.
3. Include all event details (who, what, where, when${fee ? ', price' : ''}).
4. End with an open question or CTA that gets comments: "Who's coming?", "Tag someone who needs to see this!", or "Calling all ${genre ? genre : 'music'} fans in ${city}!"
5. Do NOT use "like this post" or "share this" — Facebook penalizes that explicitly.
6. 4–6 hashtags ONLY at the very end — mix genre fans + local discovery: ${[...genreTags.split(' '), ...locationTags.split(' '), ...audienceTags.split(' ')].filter(Boolean).slice(0, 5).join(' ')}
7. 1–2 emojis max, only if natural. No emoji spam.

Audience you are reaching: (a) existing fans of the genre in ${city} and surrounding area, (b) locals who follow ${city} event pages, (c) their friends who will see it shared.

Return ONLY the post text. No explanation.`,

  youtube: ({ actName, venueName, city, state, dateFormatted, fee, genre }) =>
    `Write a YouTube Community post optimized for engagement announcing a confirmed live show.

Show details:
- Act: ${actName}${genre ? ` — Genre: ${genre}` : ''}
- Venue: ${venueName}, ${city}, ${state}
- Date: ${dateFormatted}
${fee ? `- Admission: $${fee}` : ''}

Platform algorithm rules to follow:
1. YouTube Community posts reach subscribers in their Home feed first. The algorithm amplifies posts with comments and likes, so end with a question.
2. Open with "Hey everyone!" or "Subscribers —" to signal community familiarity.
3. Cover full event details in 3–4 sentences. YouTube fans expect more detail than Instagram.
4. End with a question to drive comments: "Will you be there?", "Who's joining us in ${city}?", or a poll-style choice.
5. No hashtags — they don't drive reach on YouTube Community. Light emoji use is fine.

The post speaks directly to existing subscribers/fans and brings them into the community around this show.

Return ONLY the post text. No explanation.`,

  tiktok: ({ actName, venueName, city, state, dateFormatted, genre, genreTags, locationTags, audienceTags }) =>
    `Write a TikTok caption optimized for the For You Page (FYP) algorithm announcing a confirmed live show.

Show details:
- Act: ${actName}${genre ? ` — Genre: ${genre}` : ''}
- Venue: ${venueName}, ${city}, ${state}
- Date: ${dateFormatted}

Platform algorithm rules to follow:
1. TikTok FYP weights completion rate and early shares. Hook in the FIRST 3 WORDS — no fluff.
2. Body: 1–2 very short sentences MAX. Under 80 characters before hashtags.
3. Hashtags on a new line. Use exactly 6–8 tags across all three layers:
   Layer A — Genre fans: ${genreTags}
   Layer B — ${city} locals: ${locationTags}
   Layer C — Social discovery: ${audienceTags}
   Always add: #fyp #foryou
4. TikTok's algorithm distributes content to users whose watch history matches these tags. Niche genre tags outperform mega-tags for QUALIFIED reach.
5. 1 emoji max in body if natural.

Return ONLY the caption + hashtag block. No explanation.`,

  discord: ({ actName, venueName, city, state, dateFormatted, fee, genre }) =>
    `Write a Discord server announcement for a confirmed live show.

Show details:
- Act: ${actName}${genre ? ` — Genre: ${genre}` : ''}
- Venue: ${venueName}, ${city}, ${state}
- Date: ${dateFormatted}
${fee ? `- Admission: $${fee}` : ''}

Platform rules to follow:
1. Discord is chronological and community-driven. The goal: make fans feel like insiders who heard first.
2. Use **bold** markdown for key info (act name, venue, date). Do NOT use @everyone or @here.
3. 3–5 sentences. All show details. Warm and community-first — these are fans who chose to be here.
4. End with a community reaction prompt: "Drop a 🙌 if you're going!", "Who's making the trip to ${city}?", etc.
5. 2–4 emojis naturally placed. No hashtags — they do nothing on Discord.

Return ONLY the announcement text with markdown. No explanation.`,
};

const PLATFORM_FALLBACK: Record<Platform, (ctx: {
  actName: string; venueName: string; city: string; state: string; date: string; genre?: string;
}) => string> = {
  instagram: ({ actName, venueName, city, state, date, genre }) => {
    const tags = buildHashtagBlock('instagram', genre, city, state, 15);
    return `${actName} just locked in a show at ${venueName} in ${city}, ${state} on ${date}. Save this post — you'll want to find it when the time comes. 🎵\n\n${tags}`;
  },
  facebook: ({ actName, venueName, city, state, date, genre }) =>
    `Big news for ${genre ? `${genre} fans in ${city}` : `${city}`} — ${actName} is coming to ${venueName} on ${date}! All the details are below. Who's already planning to be there? Tag someone who needs to see this!`,
  youtube: ({ actName, venueName, city, state, date }) =>
    `Hey everyone! We've got a show coming up at ${venueName} in ${city}, ${state} on ${date}. Mark your calendars — this one is going to be a great night. Will you be there? Let us know in the comments!`,
  tiktok: ({ actName, city, state, date, genre }) => {
    const tags = buildHashtagBlock('tiktok', genre, city, state, 7);
    return `${actName} is coming to ${city}, ${state} on ${date} 🔥 Don't miss this.\n\n${tags} #fyp #foryou`;
  },
  discord: ({ actName, venueName, city, state, date }) =>
    `🎵 **Show Announcement!**\n\n**${actName}** is performing live at **${venueName}** in ${city}, ${state} on **${date}**. You heard it here first — drop a 🙌 if you're going and who else is making the trip?`,
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

  // Allow tour creator OR band admin whose act owns this tour
  const isCreator = (tv.tour as any).created_by === user.id;
  if (!isCreator) {
    const { data: prof } = await service
      .from('user_profiles')
      .select('act_id, role')
      .eq('id', user.id)
      .maybeSingle();
    const isBandAdmin = prof?.role === 'act_admin' && prof?.act_id === (tv.tour as any).act_id;
    // Also check acts.owner_id for band admins who own the act directly
    const { data: ownedAct } = await service
      .from('acts')
      .select('id')
      .eq('id', (tv.tour as any).act_id)
      .eq('owner_id', user.id)
      .maybeSingle();
    if (!isBandAdmin && !ownedAct) return res.status(403).json({ error: 'Forbidden' });
  }

  const { data: act } = await service
    .from('acts')
    .select('id, act_name, genre, bio')
    .eq('id', (tv.tour as any).act_id)
    .single();

  if (!act) return res.status(404).json({ error: 'Act not found' });

  try {
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

    await service.from('tour_venues').update({ status: 'confirmed' }).eq('id', tour_venue_id);

    const dateFormatted = new Date(show_date + 'T00:00:00').toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
    const dateFallback = new Date(show_date + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    });
    const genre = (act as any).genre as string | undefined;

    const city  = (tv.venue as any).city  as string;
    const state = (tv.venue as any).state as string;

    const fallbackCtx = {
      actName:   (act as any).act_name,
      venueName: (tv.venue as any).name,
      city, state,
      date:  dateFallback,
      genre,
    };

    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    // Generate all platform posts in parallel — each prompt receives three hashtag layers:
    // genre fans (national), location discovery (city/state locals), audience interest (social circles)
    const postResults = await Promise.allSettled(
      selectedPlatforms.map(platform => {
        const key = genre?.toLowerCase() ?? 'default';
        const genreTagArr    = GENRE_HASHTAGS[key]?.[platform]    ?? GENRE_HASHTAGS.default[platform];
        const locationTagArr = getLocationTags(city, state, platform);
        const audienceTagArr = [
          ...(AUDIENCE_TAGS[key]?.[platform]   ?? AUDIENCE_TAGS.default[platform]),
          ...SOCIAL_DISCOVERY_TAGS[platform],
        ];
        return generatePost(
          anthropic,
          platform,
          {
            actName:       (act as any).act_name,
            venueName:     (tv.venue as any).name,
            city, state,
            dateFormatted,
            fee:           fee || undefined,
            genre,
            genreTags:     genreTagArr.join(' '),
            locationTags:  locationTagArr.join(' '),
            audienceTags:  audienceTagArr.join(' '),
          },
          fallbackCtx,
        );
      })
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
