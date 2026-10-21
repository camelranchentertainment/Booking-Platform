// components/booker/RouteMapScene.tsx
//
// Header illustration for the Booking Agent workspace: the Tours desert at
// dusk, seen from the agent's chair. Small towns glow along the horizon, each
// with a map pin over it, and dashed routes arc from town to town — several
// bands' runs being stitched together at once. Telephone poles carry the line
// across the foreground, because an agent's work runs on calls and email.
//
// Inline SVG (no network request, crisp at any width). Colours are
// illustration paint, so they are literal hex values; gradient ids are
// prefixed `crAgent` so they cannot clash with another SVG on the page. The
// left side is shaded so the page title stays readable over it.

/** Towns on the horizon: x, y of the pin tip and the pin colour. */
const TOWNS: ReadonlyArray<{ x: number; y: number; pin: string }> = [
  { x: 720, y: 214, pin: '#E8823A' },
  { x: 860, y: 206, pin: '#F7C46A' },
  { x: 1000, y: 218, pin: '#7FB7E6' },
  { x: 1130, y: 204, pin: '#E8823A' },
  { x: 1270, y: 216, pin: '#9BD3A8' },
  { x: 1380, y: 208, pin: '#F7C46A' },
];

/** Dashed routes between towns, as [from index, to index, arc height]. */
const ROUTES: ReadonlyArray<[number, number, number]> = [
  [0, 1, 46],
  [1, 3, 70],
  [2, 3, 34],
  [3, 5, 58],
  [0, 2, 92],
  [2, 4, 64],
];

/** Telephone pole x positions across the foreground. */
const POLES = [470, 760, 1050, 1340];

/** A map pin whose tip sits at (x, y). */
function Pin({ x, y, fill }: { x: number; y: number; fill: string }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0 C-4 -9 -11 -14 -11 -22 A11 11 0 1 1 11 -22 C11 -14 4 -9 0 0 Z" fill={fill} />
      <circle cx="0" cy="-22" r="4.5" fill="#1A1430" />
    </g>
  );
}

/** The decorative scene. aria-hidden: it carries no information. */
export default function RouteMapScene() {
  return (
    <svg className="page-hero-art" viewBox="0 0 1440 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crAgentSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141C38" />
          <stop offset="0.5" stopColor="#4C3352" />
          <stop offset="0.8" stopColor="#B9533E" />
          <stop offset="1" stopColor="#EE9A4F" />
        </linearGradient>
        <radialGradient id="crAgentGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#F7C46A" stopOpacity="0.55" />
          <stop offset="1" stopColor="#F7C46A" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crAgentShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.94" />
          <stop offset="0.45" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crAgentFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crAgentSky)" />

      {/* Early stars */}
      <g fill="#F4F7FB" opacity="0.7">
        <circle cx="620" cy="40" r="1.4" />
        <circle cx="780" cy="72" r="1.1" />
        <circle cx="930" cy="34" r="1.6" />
        <circle cx="1090" cy="64" r="1.2" />
        <circle cx="1240" cy="30" r="1.5" />
        <circle cx="1390" cy="58" r="1.1" />
      </g>

      {/* Setting sun behind the far ridge */}
      <circle cx="1180" cy="236" r="74" fill="#F7C46A" opacity="0.14" />
      <circle cx="1180" cy="236" r="44" fill="#F7C46A" />

      {/* Far mesas */}
      <path d="M0 224 L200 224 L226 198 L380 198 L404 226 L620 226 L650 190 L760 190 L786 220 L1440 220 L1440 270 L0 270 Z" fill="#6E3843" />

      {/* Routes between towns */}
      <g fill="none" stroke="#F4F7FB" strokeWidth="2" strokeDasharray="5 7" strokeLinecap="round" opacity="0.75">
        {ROUTES.map(([a, b, h]) => {
          const from = TOWNS[a];
          const to = TOWNS[b];
          const midX = (from.x + to.x) / 2;
          const topY = Math.min(from.y, to.y) - 40 - h;
          return <path key={`${a}-${b}`} d={`M${from.x} ${from.y - 40} Q${midX} ${topY} ${to.x} ${to.y - 40}`} />;
        })}
      </g>

      {/* Town lights on the horizon, each with a pin */}
      {TOWNS.map(t => (
        <g key={t.x} transform={`translate(${t.x} ${t.y + 10}) scale(1.45) translate(${-t.x} ${-(t.y + 10)})`}>
          <ellipse cx={t.x} cy={t.y + 8} rx="34" ry="12" fill="url(#crAgentGlow)" />
          <g fill="#2B1C2E">
            <rect x={t.x - 18} y={t.y - 2} width="12" height="12" />
            <rect x={t.x - 4} y={t.y - 8} width="9" height="18" />
            <rect x={t.x + 7} y={t.y} width="12" height="10" />
          </g>
          <g fill="#F7C46A">
            <rect x={t.x - 15} y={t.y + 2} width="3" height="3" />
            <rect x={t.x - 1} y={t.y - 4} width="3" height="3" />
            <rect x={t.x + 11} y={t.y + 3} width="3" height="3" />
          </g>
          <Pin x={t.x} y={t.y - 4} fill={t.pin} />
        </g>
      ))}

      {/* Near desert floor and the two-lane */}
      <path d="M0 262 L1440 252 L1440 340 L0 340 Z" fill="#2A1C2E" />
      <path d="M0 300 L1440 286 L1440 340 L0 340 Z" fill="#151A2B" />
      <g fill="#F5C46A">
        {Array.from({ length: 16 }, (_, i) => i * 92).map(x => (
          <rect key={x} x={x} y={318 - (x / 1440) * 14} width="46" height="3" transform={`rotate(-0.56 ${x} 318)`} />
        ))}
      </g>

      {/* Telephone poles and the line between them */}
      <g fill="#1A1222">
        {POLES.map(x => (
          <g key={x}>
            <rect x={x} y="168" width="6" height="104" />
            <rect x={x - 22} y="176" width="50" height="5" />
            <rect x={x - 16} y="190" width="38" height="4" />
          </g>
        ))}
      </g>
      <g fill="none" stroke="#1A1222" strokeWidth="1.6">
        {POLES.slice(0, -1).map((x, i) => {
          const next = POLES[i + 1];
          const mid = (x + next) / 2;
          return (
            <g key={x}>
              <path d={`M${x - 20} 178 Q${mid} 204 ${next - 20} 178`} />
              <path d={`M${x + 26} 178 Q${mid + 3} 206 ${next + 26} 178`} />
              <path d={`M${x - 14} 192 Q${mid} 214 ${next - 14} 192`} />
            </g>
          );
        })}
        <path d={`M0 186 Q${POLES[0] / 2} 208 ${POLES[0] - 20} 178`} />
        <path d={`M${POLES[POLES.length - 1] + 26} 178 Q1400 200 1440 194`} />
      </g>
      {/* A bird on the wire */}
      <path d="M902 200 q4 -6 8 -2 q3 -5 7 0 l-3 3 l-8 1 Z" fill="#1A1222" />

      <rect width="1440" height="340" fill="url(#crAgentShade)" />
      <rect width="1440" height="340" fill="url(#crAgentFade)" />
    </svg>
  );
}
