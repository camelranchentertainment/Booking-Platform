// components/media/FilmStripScene.tsx
//
// Header illustration for Media: a strip of film unspooling across a dusk sky,
// each frame a tiny stage shot, over a mesa horizon with a spotlight sweeping
// up. Same desert-dusk family as the other page heroes.
//
// Inline SVG; colours are illustration paint (literal hex). ids are prefixed
// `crMedia` so they never clash with another SVG on the page. The left side is
// shaded so the page title stays readable. aria-hidden: decorative.

const FRAMES = [0, 1, 2, 3, 4, 5];

/** The decorative scene. */
export default function FilmStripScene() {
  return (
    <svg className="page-hero-art" viewBox="0 0 1440 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crMediaSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141c3c" />
          <stop offset="0.5" stopColor="#3d2a58" />
          <stop offset="0.82" stopColor="#a8484a" />
          <stop offset="1" stopColor="#e8823a" />
        </linearGradient>
        <linearGradient id="crMediaBeam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#ffd59a" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ffd59a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crMediaFrame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3d2a58" />
          <stop offset="1" stopColor="#e8823a" />
        </linearGradient>
        <linearGradient id="crMediaShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.95" />
          <stop offset="0.42" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crMediaFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.62" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crMediaSky)" />
      {[[640, 46], [760, 26], [1220, 40], [1350, 74], [980, 20]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#ffe9c7" opacity="0.7" />
      ))}

      {/* spotlight beams */}
      <path d="M900 280 L820 0 L900 0 Z" fill="url(#crMediaBeam)" />
      <path d="M1250 280 L1300 0 L1370 0 Z" fill="url(#crMediaBeam)" />

      {/* mesas + ground */}
      <path d="M560 262 L620 228 L720 228 L760 254 L900 254 L940 216 L1060 216 L1100 262 Z" fill="#5a2e44" opacity="0.75" />
      <rect x="0" y="260" width="1440" height="80" fill="#1a1222" />

      {/* the film strip, tilted, with six frames */}
      <g transform="rotate(-8 1080 150)">
        <rect x="740" y="92" width="700" height="120" fill="#120c18" />
        {Array.from({ length: 28 }, (_, i) => (
          <g key={i}>
            <rect x={748 + i * 25} y="98" width="12" height="9" rx="2" fill="#3d2436" />
            <rect x={748 + i * 25} y="197" width="12" height="9" rx="2" fill="#3d2436" />
          </g>
        ))}
        {FRAMES.map(i => {
          const x = 756 + i * 114;
          return (
            <g key={i}>
              <rect x={x} y="114" width="100" height="76" rx="3" fill="url(#crMediaFrame)" opacity={0.75 + (i % 2) * 0.2} />
              {/* a tiny stage: three silhouettes and a light */}
              <circle cx={x + 50} cy="124" r="6" fill="#ffd59a" opacity="0.8" />
              <rect x={x + 22} y="160" width="10" height="24" rx="4" fill="#120c18" />
              <rect x={x + 45} y="154" width="10" height="30" rx="4" fill="#120c18" />
              <rect x={x + 68} y="160" width="10" height="24" rx="4" fill="#120c18" />
              <rect x={x} y="182" width="100" height="8" fill="#24162c" />
            </g>
          );
        })}
      </g>

      <rect width="1440" height="340" fill="url(#crMediaShade)" />
      <rect width="1440" height="340" fill="url(#crMediaFade)" />
    </svg>
  );
}
