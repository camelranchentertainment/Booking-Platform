import { ImageResponse } from '@vercel/og';
import { createClient } from '@supabase/supabase-js';
import QRCode from 'qrcode';

export const config = { runtime: 'edge' };

const W = 1080;
const H = 1512;
const AMBER = '#C8921A';

interface IncludedFields {
  ticketPrice?: string;
  openerName?: string;
  ageRestriction?: string;
  ticketUrl?: string;
}

interface PosterParams {
  style: string;
  actName: string;
  venueName: string;
  venueCity: string;
  showDate: string;
  photoDataUri: string | null;
  qrDataUri: string | null;
  includedFields: IncludedFields;
}

// Chunk-safe base64 encoding for large ArrayBuffers
function ab2b64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    s += String.fromCharCode(...(bytes.subarray(i, i + 8192) as unknown as number[]));
  }
  return btoa(s);
}

function DetailRow({ label, value }: { label?: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
      {label && (
        <span style={{ fontFamily: 'Playfair', fontSize: 24, color: '#C8921A', fontWeight: 400 }}>
          {label}:
        </span>
      )}
      <span style={{ fontFamily: 'Playfair', fontSize: 24, color: '#D4B88C', fontWeight: 400 }}>
        {value}
      </span>
    </div>
  );
}

// ─── AMERICANA ───────────────────────────────────────────────────────────────
// Deep sepia tones, warm gold accents, photo in ornate frame, Bebas Neue headline
function americana(p: PosterParams) {
  const { actName, venueName, venueCity, showDate, photoDataUri, qrDataUri, includedFields } = p;
  const hasDetails = includedFields.ticketPrice || includedFields.ageRestriction || includedFields.openerName;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: W,
        height: H,
        backgroundColor: '#1C0B00',
        padding: '56px 64px',
      }}
    >
      {/* Top ornamental bar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
        <div style={{ display: 'flex', width: '100%', height: '3px', backgroundColor: AMBER, opacity: 0.6 }} />
        <div style={{ display: 'flex', width: '80%', height: '1px', backgroundColor: AMBER, opacity: 0.4, marginTop: '6px' }} />
      </div>

      {/* Subtitle line */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
        <span style={{ fontFamily: 'Playfair', fontSize: 28, color: '#C8921A', letterSpacing: '0.25em', fontWeight: 400 }}>
          PRESENTS
        </span>
      </div>

      {/* Act name */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '32px' }}>
        <span
          style={{
            fontFamily: 'Bebas',
            fontSize: actName.length > 16 ? 96 : 128,
            color: '#F5E6C8',
            letterSpacing: '0.05em',
            textAlign: 'center',
            lineHeight: 1,
          }}
        >
          {actName}
        </span>
      </div>

      {/* Photo in ornate frame */}
      {photoDataUri ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '36px' }}>
          <div
            style={{
              display: 'flex',
              border: '6px solid #C8921A',
              padding: '10px',
              backgroundColor: '#0E0603',
              boxShadow: '0 0 0 2px #2B1500, 0 0 0 4px #C8921A88',
            }}
          >
            <img
              src={photoDataUri}
              width={840}
              height={500}
              style={{ objectFit: 'cover', filter: 'sepia(75%) contrast(1.1) brightness(0.92)' }}
            />
          </div>
        </div>
      ) : (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            width: '100%',
            height: 500,
            marginBottom: '36px',
            border: '4px solid #C8921A44',
            backgroundColor: '#2B1500',
          }}
        >
          <span style={{ fontFamily: 'Playfair', fontSize: 32, color: '#C8921A44' }}>LIVE</span>
        </div>
      )}

      {/* Venue and date */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
        {venueName && (
          <span style={{ fontFamily: 'Bebas', fontSize: 72, color: AMBER, letterSpacing: '0.06em' }}>
            {venueName}
          </span>
        )}
        {venueCity && (
          <span style={{ fontFamily: 'Playfair', fontSize: 30, color: '#D4B88C', fontWeight: 400 }}>
            {venueCity}
          </span>
        )}
        {showDate && (
          <span style={{ fontFamily: 'Bebas', fontSize: 48, color: '#F5E6C8', letterSpacing: '0.08em' }}>
            {showDate}
          </span>
        )}
      </div>

      {/* Divider */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '20px' }}>
        <div style={{ display: 'flex', width: '60%', height: '1px', backgroundColor: '#C8921A66' }} />
      </div>

      {/* Details row */}
      {hasDetails && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', marginBottom: '20px' }}>
          {includedFields.ticketPrice && (
            <DetailRow label="Tickets" value={includedFields.ticketPrice} />
          )}
          {includedFields.ageRestriction && (
            <DetailRow value={includedFields.ageRestriction} />
          )}
          {includedFields.openerName && (
            <DetailRow label="With" value={includedFields.openerName} />
          )}
        </div>
      )}

      {/* QR code */}
      {qrDataUri && (
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
            <img src={qrDataUri} width={140} height={140} />
            <span style={{ fontFamily: 'Playfair', fontSize: 18, color: '#C8921A88', fontWeight: 400 }}>
              GET TICKETS
            </span>
          </div>
        </div>
      )}

      {/* Bottom ornamental bar */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 'auto' }}>
        <div style={{ display: 'flex', width: '80%', height: '1px', backgroundColor: AMBER, opacity: 0.4, marginBottom: '6px' }} />
        <div style={{ display: 'flex', width: '100%', height: '3px', backgroundColor: AMBER, opacity: 0.6 }} />
      </div>
    </div>
  );
}

// ─── ELECTRIC ────────────────────────────────────────────────────────────────
// Full-bleed photo, dark-to-amber gradient overlay, bold high-contrast type
function electric(p: PosterParams) {
  const { actName, venueName, venueCity, showDate, photoDataUri, qrDataUri, includedFields } = p;

  return (
    <div style={{ display: 'flex', width: W, height: H, position: 'relative', backgroundColor: '#0A0200', overflow: 'hidden' }}>
      {/* Full-bleed photo — darkened */}
      {photoDataUri && (
        <img
          src={photoDataUri}
          width={W}
          height={H}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            objectFit: 'cover',
            filter: 'brightness(0.45) contrast(1.2) saturate(0.8)',
          }}
        />
      )}

      {/* Gradient overlay: dark top fading to amber-tinted bottom */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: W,
          height: H,
          backgroundImage: 'linear-gradient(to bottom, rgba(10,2,0,0.55) 0%, rgba(10,2,0,0.2) 40%, rgba(14,6,3,0.85) 75%, rgba(14,6,3,0.98) 100%)',
        }}
      />

      {/* Amber side accent bars */}
      <div style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: H, backgroundColor: AMBER }} />
      <div style={{ position: 'absolute', top: 0, right: 0, width: '6px', height: H, backgroundColor: AMBER }} />

      {/* Content layer */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          width: W,
          height: H,
          padding: '64px 80px',
          position: 'relative',
        }}
      >
        {/* Top amber tag */}
        <div style={{ display: 'flex', marginBottom: '16px' }}>
          <div
            style={{
              display: 'flex',
              backgroundColor: AMBER,
              padding: '6px 24px',
            }}
          >
            <span style={{ fontFamily: 'Bebas', fontSize: 28, color: '#0E0603', letterSpacing: '0.15em' }}>
              LIVE
            </span>
          </div>
        </div>

        {/* Spacer to push name toward center */}
        <div style={{ display: 'flex', flex: 1 }} />

        {/* Act name — massive */}
        <div style={{ display: 'flex', flexDirection: 'column', marginBottom: '32px' }}>
          <span
            style={{
              fontFamily: 'Bebas',
              fontSize: actName.length > 14 ? 120 : 160,
              color: '#FFFFFF',
              letterSpacing: '0.04em',
              lineHeight: 0.9,
            }}
          >
            {actName}
          </span>
          {/* Amber underline */}
          <div style={{ display: 'flex', width: '120px', height: '6px', backgroundColor: AMBER, marginTop: '16px' }} />
        </div>

        {/* Venue block */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            borderLeft: '3px solid #C8921A',
            paddingLeft: '24px',
            gap: '8px',
            marginBottom: '36px',
          }}
        >
          {venueName && (
            <span style={{ fontFamily: 'Bebas', fontSize: 52, color: AMBER, letterSpacing: '0.06em' }}>
              {venueName}
            </span>
          )}
          {venueCity && (
            <span style={{ fontFamily: 'Playfair', fontSize: 28, color: '#D4B88C', fontWeight: 400 }}>
              {venueCity}
            </span>
          )}
          {showDate && (
            <span style={{ fontFamily: 'Bebas', fontSize: 40, color: '#FFFFFF', letterSpacing: '0.08em' }}>
              {showDate}
            </span>
          )}
        </div>

        {/* Bottom row: details + QR */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {includedFields.ticketPrice && (
              <span style={{ fontFamily: 'Bebas', fontSize: 36, color: AMBER, letterSpacing: '0.1em' }}>
                {includedFields.ticketPrice}
              </span>
            )}
            {includedFields.ageRestriction && (
              <span style={{ fontFamily: 'Playfair', fontSize: 24, color: '#D4B88C', fontWeight: 400 }}>
                {includedFields.ageRestriction}
              </span>
            )}
            {includedFields.openerName && (
              <span style={{ fontFamily: 'Playfair', fontSize: 24, color: '#D4B88C', fontWeight: 400 }}>
                + {includedFields.openerName}
              </span>
            )}
          </div>

          {qrDataUri && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
              <div
                style={{
                  display: 'flex',
                  padding: '8px',
                  backgroundColor: '#FFFFFF',
                }}
              >
                <img src={qrDataUri} width={130} height={130} />
              </div>
              <span style={{ fontFamily: 'Bebas', fontSize: 20, color: AMBER, letterSpacing: '0.12em' }}>
                TICKETS
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── WESTERN ─────────────────────────────────────────────────────────────────
// Desaturated warm photo, ornate nested border, Playfair Display serif type
function western(p: PosterParams) {
  const { actName, venueName, venueCity, showDate, photoDataUri, qrDataUri, includedFields } = p;
  const hasDetails = includedFields.ticketPrice || includedFields.ageRestriction || includedFields.openerName;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: W,
        height: H,
        backgroundColor: '#110800',
        padding: '40px',
      }}
    >
      {/* Outer border frame */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flex: 1,
          border: '4px solid #8B6914',
          padding: '20px',
        }}
      >
        {/* Inner border frame */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            border: '2px solid #C8921A44',
            padding: '32px',
          }}
        >
          {/* Act name */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
            <span style={{ fontFamily: 'Playfair', fontSize: 28, color: '#8B6914', letterSpacing: '0.3em', fontWeight: 400 }}>
              ✦ LIVE IN CONCERT ✦
            </span>
            <span
              style={{
                fontFamily: 'Bebas',
                fontSize: actName.length > 16 ? 88 : 112,
                color: '#F5E6C8',
                letterSpacing: '0.06em',
                textAlign: 'center',
                lineHeight: 1,
                marginTop: '12px',
              }}
            >
              {actName}
            </span>
          </div>

          {/* Ornamental divider */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', flex: 1, height: '1px', backgroundColor: '#8B6914' }} />
            <span style={{ fontFamily: 'Playfair', fontSize: 20, color: '#C8921A', fontWeight: 400 }}>✦</span>
            <div style={{ display: 'flex', flex: 1, height: '1px', backgroundColor: '#8B6914' }} />
          </div>

          {/* Photo — desaturated sepia tint */}
          {photoDataUri ? (
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '28px' }}>
              <div style={{ display: 'flex', border: '4px solid #8B6914', padding: '8px', backgroundColor: '#1A0A00' }}>
                <img
                  src={photoDataUri}
                  width={820}
                  height={460}
                  style={{ objectFit: 'cover', filter: 'grayscale(80%) sepia(40%) contrast(1.05) brightness(0.9)' }}
                />
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                width: '100%',
                height: 460,
                marginBottom: '28px',
                backgroundColor: '#1A0A00',
                border: '2px solid #8B691444',
              }}
            />
          )}

          {/* Venue and date */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            {venueName && (
              <span style={{ fontFamily: 'Bebas', fontSize: 64, color: '#C8921A', letterSpacing: '0.07em' }}>
                {venueName}
              </span>
            )}
            {venueCity && (
              <span style={{ fontFamily: 'Playfair', fontSize: 28, color: '#D4B88C', fontWeight: 400 }}>
                {venueCity}
              </span>
            )}
            {showDate && (
              <span style={{ fontFamily: 'Playfair', fontSize: 32, color: '#F5E6C8', fontWeight: 700 }}>
                {showDate}
              </span>
            )}
          </div>

          {/* Ornamental divider */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '16px', marginBottom: '20px' }}>
            <div style={{ display: 'flex', flex: 1, height: '1px', backgroundColor: '#8B6914' }} />
            <span style={{ fontFamily: 'Playfair', fontSize: 20, color: '#C8921A', fontWeight: 400 }}>✦</span>
            <div style={{ display: 'flex', flex: 1, height: '1px', backgroundColor: '#8B6914' }} />
          </div>

          {/* Details */}
          {hasDetails && (
            <div style={{ display: 'flex', justifyContent: 'center', gap: '48px', marginBottom: '16px' }}>
              {includedFields.ticketPrice && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Playfair', fontSize: 18, color: '#8B6914', letterSpacing: '0.15em', fontWeight: 400 }}>ADMISSION</span>
                  <span style={{ fontFamily: 'Playfair', fontSize: 28, color: '#F5E6C8', fontWeight: 700 }}>{includedFields.ticketPrice}</span>
                </div>
              )}
              {includedFields.ageRestriction && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Playfair', fontSize: 18, color: '#8B6914', letterSpacing: '0.15em', fontWeight: 400 }}>AGE</span>
                  <span style={{ fontFamily: 'Playfair', fontSize: 28, color: '#F5E6C8', fontWeight: 700 }}>{includedFields.ageRestriction}</span>
                </div>
              )}
              {includedFields.openerName && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <span style={{ fontFamily: 'Playfair', fontSize: 18, color: '#8B6914', letterSpacing: '0.15em', fontWeight: 400 }}>FEATURING</span>
                  <span style={{ fontFamily: 'Playfair', fontSize: 28, color: '#F5E6C8', fontWeight: 700 }}>{includedFields.openerName}</span>
                </div>
              )}
            </div>
          )}

          {/* QR code */}
          {qrDataUri && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                <div style={{ display: 'flex', padding: '8px', backgroundColor: '#F5E6C8' }}>
                  <img src={qrDataUri} width={130} height={130} />
                </div>
                <span style={{ fontFamily: 'Playfair', fontSize: 18, color: '#8B6914', letterSpacing: '0.2em', fontWeight: 400 }}>GET TICKETS</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Handler ──────────────────────────────────────────────────────────────────

function jsonErr(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return jsonErr(405, 'Method not allowed');

  const token = req.headers.get('authorization')?.replace('Bearer ', '');
  if (!token) return jsonErr(401, 'Unauthorized');

  let body: { bookingId?: string; style?: string; mediaAssetId?: string; includedFields?: IncludedFields };
  try {
    body = await req.json();
  } catch {
    return jsonErr(400, 'Invalid JSON');
  }

  const { bookingId, style, mediaAssetId, includedFields = {} } = body;
  if (!bookingId || !style) return jsonErr(400, 'bookingId and style required');
  if (!['americana', 'electric', 'western'].includes(style)) {
    return jsonErr(400, 'style must be americana, electric, or western');
  }

  const service = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data: { user } } = await service.auth.getUser(token);
  if (!user) return jsonErr(401, 'Unauthorized');

  // Resolve caller's act — service client bypasses RLS, ownership must be explicit
  const { data: profile } = await service
    .from('profiles')
    .select('act_id')
    .eq('id', user.id)
    .single();
  if (!profile?.act_id) return jsonErr(403, 'Forbidden');

  // Fetch booking scoped to caller's act — 403 if not found (no act_id leak)
  const { data: booking } = await service
    .from('bookings')
    .select('id, show_date, venue:venues(name, city, state)')
    .eq('id', bookingId)
    .eq('act_id', profile.act_id)
    .maybeSingle();
  if (!booking) return jsonErr(403, 'Forbidden');

  const { data: act } = await service
    .from('acts')
    .select('act_name')
    .eq('id', profile.act_id)
    .single();
  const actName = (act?.act_name || 'Artist Name').toUpperCase();

  const venue = booking.venue as any;
  const venueName = (venue?.name || '').toUpperCase();
  const venueCity = [venue?.city, venue?.state].filter(Boolean).join(', ');
  const showDate = booking.show_date
    ? new Date(booking.show_date + 'T12:00:00Z').toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  // Load fonts from /public/fonts/ via HTTP
  const origin = new URL(req.url).origin;
  const [bebasFont, playfairFont, playfairBoldFont] = await Promise.all([
    fetch(`${origin}/fonts/BebasNeue-Regular.ttf`).then(r => r.arrayBuffer()),
    fetch(`${origin}/fonts/PlayfairDisplay-Regular.ttf`).then(r => r.arrayBuffer()),
    fetch(`${origin}/fonts/PlayfairDisplay-Bold.ttf`).then(r => r.arrayBuffer()),
  ]);

  // Fetch and inline media asset as base64 data URI (scoped to caller's act)
  // NOTE: table/bucket fixed from legacy 'media_assets' → 'media_library' —
  // 'media_assets' was dropped in the media-library migration; this lookup
  // was silently returning no rows, so photoDataUri always stayed null and
  // every poster style fell back to the empty "LIVE" placeholder box.
  let photoDataUri: string | null = null;
  if (mediaAssetId) {
    const { data: asset } = await service
      .from('media_library')
      .select('storage_path, mime_type')
      .eq('id', mediaAssetId)
      .eq('act_id', profile.act_id)
      .single();
    if (asset?.storage_path) {
      const { data: signed } = await service.storage
        .from('media-library')
        .createSignedUrl(asset.storage_path, 300);
      if (signed?.signedUrl) {
        const imgBuf = await fetch(signed.signedUrl).then(r => r.arrayBuffer());
        const mime = asset.mime_type || 'image/jpeg';
        photoDataUri = `data:${mime};base64,${ab2b64(imgBuf)}`;
      }
    }
  }

  // Generate QR code as SVG data URI
  let qrDataUri: string | null = null;
  if (includedFields?.ticketUrl) {
    try {
      const svg = await QRCode.toString(includedFields.ticketUrl, {
        type: 'svg',
        margin: 2,
        width: 200,
        color: { dark: '#000000', light: '#FFFFFF' },
      });
      qrDataUri = 'data:image/svg+xml;base64,' + btoa(svg);
    } catch {
      // QR generation failed — omit silently
    }
  }

  const params: PosterParams = {
    style,
    actName,
    venueName,
    venueCity,
    showDate,
    photoDataUri,
    qrDataUri,
    includedFields,
  };

  const jsx =
    style === 'americana' ? americana(params)
    : style === 'electric' ? electric(params)
    : western(params);

  try {
    return new ImageResponse(jsx, {
      width: W,
      height: H,
      fonts: [
        { name: 'Bebas', data: bebasFont, weight: 400, style: 'normal' },
        { name: 'Playfair', data: playfairFont, weight: 400, style: 'normal' },
        { name: 'Playfair', data: playfairBoldFont, weight: 700, style: 'normal' },
      ],
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: 'Poster generation failed', detail: message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
