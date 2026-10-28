// components/analytics/SoundboardScene.tsx
//
// Header illustration for Analytics: an outdoor stage at dusk whose lighting
// truss is a row of rising level meters — the band's numbers as a light show.
// Same desert-dusk family as the Tours highway and the other page heroes.
//
// Inline SVG; colours are illustration paint (literal hex). ids are prefixed
// `crStats` so they never clash with another SVG on the page. The left side is
// shaded so the page title stays readable over it. aria-hidden: decorative.

/** Heights (0–1) of the meter columns across the truss, left to right. */
const LEVELS = [0.35, 0.55, 0.45, 0.7, 0.6, 0.85, 0.75, 0.95, 0.8, 0.65, 0.9, 0.7, 0.5, 0.6];
const SEGMENTS = 9;

/** The decorative scene. */
export default function SoundboardScene() {
  const colW = 22;
  const gap = 10;
  const x0 = 760;
  const yBase = 150;
  const segH = 9;
  return (
    <svg className="page-hero-art" viewBox="0 0 1440 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crStatsSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141c3c" />
          <stop offset="0.5" stopColor="#3d2a58" />
          <stop offset="0.8" stopColor="#a8484a" />
          <stop offset="1" stopColor="#e8823a" />
        </linearGradient>
        <radialGradient id="crStatsGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffb469" stopOpacity="0.55" />
          <stop offset="1" stopColor="#ffb469" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crStatsBeam" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffd59a" stopOpacity="0.32" />
          <stop offset="1" stopColor="#ffd59a" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crStatsShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.95" />
          <stop offset="0.42" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crStatsFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.62" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crStatsSky)" />
      {/* a few early stars */}
      {[[640, 40], [700, 82], [1180, 30], [1320, 70], [1010, 54], [880, 22]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#ffe9c7" opacity="0.7" />
      ))}

      {/* distant mesas */}
      <path d="M540 262 L600 226 L690 226 L730 252 L860 252 L900 214 L1010 214 L1050 262 Z" fill="#5a2e44" opacity="0.75" />
      <path d="M1200 262 L1250 232 L1360 232 L1400 262 Z" fill="#5a2e44" opacity="0.6" />

      {/* crowd glow and stage */}
      <ellipse cx="1000" cy="250" rx="300" ry="90" fill="url(#crStatsGlow)" />
      <rect x="700" y="232" width="600" height="30" fill="#24162c" />
      <rect x="700" y="228" width="600" height="6" fill="#3d2436" />

      {/* light beams from the truss */}
      {[800, 900, 1000, 1100, 1200].map((x, i) => (
        <path key={x} d={`M${x} 158 L${x - 60 + i * 6} 232 L${x + 60 + i * 6} 232 Z`} fill="url(#crStatsBeam)" />
      ))}

      {/* truss towers + crossbar */}
      <rect x="742" y="96" width="8" height="136" fill="#1a1222" />
      <rect x="1250" y="96" width="8" height="136" fill="#1a1222" />
      <rect x="742" y="152" width="516" height="8" fill="#1a1222" />

      {/* level meters across the truss — the "numbers" */}
      {LEVELS.map((level, i) => {
        const lit = Math.max(1, Math.round(level * SEGMENTS));
        const x = x0 + i * (colW + gap);
        return (
          <g key={i}>
            {Array.from({ length: SEGMENTS }, (_, s) => {
              const on = s < lit;
              const hot = s >= SEGMENTS - 2;
              const warm = s >= SEGMENTS - 4;
              const fill = !on ? '#2a1f33' : hot ? '#ff6a3d' : warm ? '#f5b041' : '#4a90e2';
              return (
                <rect
                  key={s}
                  x={x}
                  y={yBase - (s + 1) * (segH + 2)}
                  width={colW}
                  height={segH}
                  rx="1.5"
                  fill={fill}
                  opacity={on ? 0.95 : 0.6}
                />
              );
            })}
          </g>
        );
      })}

      {/* the crowd */}
      <g fill="#120c18">
        {Array.from({ length: 34 }, (_, i) => {
          const x = 690 + i * 19 + (i % 3) * 3;
          const h = 14 + ((i * 7) % 9);
          return <circle key={i} cx={x} cy={300 - h} r={7 + (i % 2)} />;
        })}
        <rect x="660" y="286" width="720" height="60" />
        {/* a few hands up */}
        <rect x="822" y="262" width="4" height="22" rx="2" transform="rotate(-12 824 273)" />
        <rect x="1012" y="258" width="4" height="24" rx="2" transform="rotate(10 1014 270)" />
        <rect x="1166" y="264" width="4" height="20" rx="2" transform="rotate(-8 1168 274)" />
      </g>

      <rect width="1440" height="340" fill="url(#crStatsShade)" />
      <rect width="1440" height="340" fill="url(#crStatsFade)" />
    </svg>
  );
}
