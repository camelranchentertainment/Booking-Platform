// components/today/ShowNightScene.tsx
//
// Header illustration for the Today page: the same desert dusk as the Tours
// highway, a little later in the evening — first stars out, a roadhouse with a
// lit marquee and a neon guitar, string lights over the patio and stage light
// sweeping the sky. Tonight's the show.
//
// Inline SVG (no network request, crisp at any width). Colours are illustration
// paint, so they are literal hex values; gradient ids are prefixed `crToday`
// so they cannot clash with another SVG on the page. The left side is shaded
// so the page title stays readable over it.

const STARS: ReadonlyArray<readonly [number, number, number]> = [
  [612, 34, 1.4], [688, 72, 1], [742, 22, 1.2], [806, 58, 1.6], [872, 30, 1], [934, 84, 1.2],
  [998, 40, 1.5], [1062, 18, 1], [1118, 66, 1.2], [1186, 36, 1], [1302, 58, 1.3], [1368, 24, 1.1],
  [1410, 90, 1], [560, 88, 1], [1236, 104, 0.9], [962, 120, 0.9],
];

/** x positions of the bulbs strung from the roadhouse eave to the patio pole. */
const BULBS = Array.from({ length: 11 }, (_, i) => 1236 + i * 14);

/** The decorative scene. aria-hidden: it carries no information. */
export default function ShowNightScene() {
  return (
    <svg
      className="page-hero-art"
      viewBox="0 0 1440 340"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id="crTodaySky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0E1530" />
          <stop offset="0.42" stopColor="#2C2452" />
          <stop offset="0.72" stopColor="#8A3E52" />
          <stop offset="1" stopColor="#E0763E" />
        </linearGradient>
        <linearGradient id="crTodayBeam" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#F5EDD9" stopOpacity="0.22" />
          <stop offset="1" stopColor="#F5EDD9" stopOpacity="0" />
        </linearGradient>
        <radialGradient id="crTodayGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F7C46A" stopOpacity="0.55" />
          <stop offset="1" stopColor="#F7C46A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crTodayShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.94" />
          <stop offset="0.45" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crTodayFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crTodaySky)" />

      {/* Stars and a crescent moon */}
      <g fill="#F5EDD9">
        {STARS.map(([x, y, r]) => <circle key={`${x}-${y}`} cx={x} cy={y} r={r} opacity="0.8" />)}
      </g>
      <circle cx="1290" cy="66" r="20" fill="#F5EDD9" opacity="0.92" />
      <circle cx="1299" cy="60" r="18" fill="#1A1A3C" />

      {/* Stage light sweeping up from behind the roadhouse */}
      <path d="M1010 150 L900 0 L960 0 Z" fill="url(#crTodayBeam)" />
      <path d="M1050 150 L1120 0 L1190 0 Z" fill="url(#crTodayBeam)" />

      {/* Far mesas */}
      <path d="M0 220 L140 220 L162 196 L320 196 L344 222 L520 222 L548 186 L660 186 L684 214 L1440 214 L1440 262 L0 262 Z" fill="#6A3446" />

      {/* Desert floor and the gravel lot */}
      <rect y="250" width="1440" height="90" fill="#24192C" />
      <rect y="276" width="1440" height="64" fill="#171A2A" />

      {/* Roadhouse: false-front facade, pitched roof behind, lit windows and door */}
      <g>
        <path d="M880 176 L1030 132 L1180 176 Z" fill="#1C1426" />
        <rect x="880" y="176" width="300" height="100" fill="#2A1E34" />
        <rect x="910" y="146" width="240" height="34" fill="#2A1E34" />
        <rect x="910" y="144" width="240" height="4" fill="#3B2C47" />
        {/* Neon guitar on the facade */}
        <g fill="none" stroke="#E8823A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1004 172 Q992 162 996 154 Q1002 148 1010 154 Q1018 148 1024 154 Q1028 162 1016 172 Q1022 178 1014 184 Q1010 186 1006 184 Q998 178 1004 172 Z" opacity="0.35" strokeWidth="7" />
          <path d="M1004 172 Q992 162 996 154 Q1002 148 1010 154 Q1018 148 1024 154 Q1028 162 1016 172 Q1022 178 1014 184 Q1010 186 1006 184 Q998 178 1004 172 Z" />
          <path d="M1010 154 L1050 120" />
          <path d="M1046 118 L1056 112" strokeWidth="5" />
        </g>
        {/* Windows */}
        {[900, 1110].map(x => (
          <g key={x}>
            <rect x={x} y="206" width="52" height="34" rx="2" fill="#F7C46A" opacity="0.85" />
            <rect x={x} y="221" width="52" height="2" fill="#2A1E34" />
            <rect x={x + 25} y="206" width="2" height="34" fill="#2A1E34" />
          </g>
        ))}
        {/* Open stage door with warm spill */}
        <ellipse cx="1030" cy="276" rx="70" ry="10" fill="url(#crTodayGlow)" />
        <rect x="1006" y="214" width="48" height="62" rx="2" fill="#F7C46A" />
        <rect x="1006" y="214" width="48" height="62" rx="2" fill="#E8823A" opacity="0.35" />
        <rect x="1000" y="208" width="60" height="6" fill="#3B2C47" />
      </g>

      {/* Marquee sign on its pole */}
      <g>
        <rect x="806" y="168" width="6" height="108" fill="#1A1222" />
        <rect x="752" y="110" width="114" height="64" rx="4" fill="#1B2132" stroke="#3B2C47" strokeWidth="2" />
        <rect x="766" y="124" width="86" height="8" rx="2" fill="#E8823A" />
        <rect x="772" y="140" width="74" height="6" rx="2" fill="#F5EDD9" opacity="0.85" />
        <rect x="780" y="154" width="58" height="6" rx="2" fill="#F5EDD9" opacity="0.6" />
        <g fill="#F7E3B0">
          {Array.from({ length: 10 }, (_, i) => 760 + i * 11).map(x => (
            <g key={x}>
              <circle cx={x} cy="114" r="1.8" />
              <circle cx={x} cy="170" r="1.8" />
            </g>
          ))}
        </g>
      </g>

      {/* String lights to the patio pole */}
      <rect x="1388" y="186" width="5" height="90" fill="#1A1222" />
      <path d="M1180 182 Q1286 222 1390 188" fill="none" stroke="#1A1222" strokeWidth="1.5" />
      <g fill="#F7C46A">
        {BULBS.map(x => {
          // Points on the quadratic curve above, sampled by x.
          const t = (x - 1180) / 210;
          const y = (1 - t) * (1 - t) * 182 + 2 * (1 - t) * t * 222 + t * t * 188;
          return <circle key={x} cx={x} cy={y + 3} r="2.6" />;
        })}
      </g>

      {/* Saguaros */}
      <g fill="#1A1222">
        <path d="M640 276 L640 212 Q640 204 648 204 Q656 204 656 212 L656 276 Z" />
        <path d="M640 246 L628 246 Q620 246 620 238 L620 224 Q620 218 626 218 Q632 218 632 224 L632 236 L640 236 Z" />
        <path d="M656 234 L668 234 L668 218 Q668 212 674 212 Q680 212 680 218 L680 236 Q680 244 672 244 L656 244 Z" />
        <path d="M1240 276 L1240 236 Q1240 230 1246 230 Q1252 230 1252 236 L1252 276 Z" />
        <path d="M1252 256 L1260 256 L1260 246 Q1260 241 1265 241 Q1270 241 1270 246 L1270 258 Q1270 264 1264 264 L1252 264 Z" />
      </g>

      <rect width="1440" height="340" fill="url(#crTodayShade)" />
      <rect width="1440" height="340" fill="url(#crTodayFade)" />
    </svg>
  );
}
