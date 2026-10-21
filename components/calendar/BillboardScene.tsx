// components/calendar/BillboardScene.tsx
//
// Header illustration for the Calendar page: the Tours desert at dusk, with a
// roadside billboard whose face is a month grid — a few nights lit orange
// (booked) and a few dashed (tour nights being worked) — and telephone poles
// running off toward the sunset on the right.
//
// Inline SVG (no network request, crisp at any width). Colours are
// illustration paint, so they are literal hex values; gradient ids are
// prefixed `crCal` so they cannot clash with another SVG on the page.

/** Grid cells lit on the billboard: [col, row, kind]. */
const LIT: ReadonlyArray<readonly [number, number, 'booked' | 'working']> = [
  [4, 0, 'booked'], [5, 0, 'booked'], [1, 1, 'working'], [5, 1, 'booked'], [6, 1, 'booked'],
  [2, 2, 'working'], [3, 2, 'working'], [5, 3, 'booked'], [6, 3, 'booked'], [0, 4, 'booked'],
];
const POLES = [1300, 1170, 1070, 994];

/** The decorative scene. aria-hidden: it carries no information. */
export default function BillboardScene() {
  const gx = 930;
  const gy = 74;
  const cw = 30;
  const ch = 20;
  return (
    <svg className="page-hero-art" viewBox="0 0 1440 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crCalSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1B2547" />
          <stop offset="0.45" stopColor="#6B3A4E" />
          <stop offset="0.75" stopColor="#C8573A" />
          <stop offset="1" stopColor="#F09A4E" />
        </linearGradient>
        <linearGradient id="crCalShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.94" />
          <stop offset="0.45" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crCalFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crCalSky)" />
      <circle cx="1180" cy="214" r="70" fill="#F7C46A" opacity="0.16" />
      <circle cx="1180" cy="214" r="44" fill="#F7C46A" />

      <path d="M0 216 L130 216 L150 190 L320 190 L340 216 L540 216 L566 178 L650 178 L676 210 L900 210 L926 186 L1120 186 L1146 212 L1440 212 L1440 262 L0 262 Z" fill="#7A3B45" />
      <rect y="250" width="1440" height="90" fill="#2A1C2E" />
      {/* Road vanishing toward the sun */}
      <path d="M1160 252 L1200 252 L1470 340 L890 340 Z" fill="#151A2B" />
      <path d="M1178 254 L1182 254 L1190 340 L1170 340 Z" fill="#F5C46A" opacity="0.7" />

      {/* Telephone poles and sagging wire */}
      <g fill="#1A1222">
        {POLES.map((x, i) => {
          const h = 40 + i * 22;
          return (
            <g key={x}>
              <rect x={x} y={262 - h} width={3 + i} height={h} />
              <rect x={x - 8 - i * 2} y={266 - h} width={19 + i * 5} height="3" />
            </g>
          );
        })}
      </g>
      <path d="M1303 160 Q1240 190 1173 182 Q1120 200 1073 204 Q1030 230 996 222" fill="none" stroke="#1A1222" strokeWidth="1.2" />

      {/* Billboard: legs, frame, month grid */}
      <g transform="translate(-230 22)">
        <rect x="980" y="226" width="8" height="40" fill="#1A1222" />
        <rect x="1124" y="226" width="8" height="40" fill="#1A1222" />
        <rect x="914" y="52" width="244" height="178" rx="6" fill="#1B2132" stroke="#3B2C47" strokeWidth="3" />
        <rect x="930" y="62" width="212" height="8" rx="2" fill="#E8823A" />
        {Array.from({ length: 35 }, (_, i) => {
          const c = i % 7;
          const r = Math.floor(i / 7);
          const lit = LIT.find(([lc, lr]) => lc === c && lr === r);
          const x = gx + c * cw + 2;
          const y = gy + r * (ch + 8) + 8;
          if (lit?.[2] === 'booked') return <rect key={i} x={x} y={y} width={cw - 6} height={ch} rx="3" fill="#E8823A" />;
          if (lit?.[2] === 'working') return <rect key={i} x={x} y={y} width={cw - 6} height={ch} rx="3" fill="none" stroke="#F5C46A" strokeWidth="1.6" strokeDasharray="3 2" />;
          return <rect key={i} x={x} y={y} width={cw - 6} height={ch} rx="3" fill="#F5EDD9" opacity="0.1" />;
        })}
        {/* Lamps over the board */}
        {[960, 1036, 1112].map(x => (
          <g key={x}>
            <rect x={x} y="40" width="2" height="14" fill="#1A1222" />
            <path d={`M${x - 8} 40 L${x + 10} 40 L${x + 6} 34 L${x - 4} 34 Z`} fill="#1A1222" />
          </g>
        ))}
      </g>

      {/* Saguaros */}
      <g fill="#1A1222">
        <path d="M560 266 L560 214 Q560 206 568 206 Q576 206 576 214 L576 266 Z" />
        <path d="M560 240 L548 240 Q540 240 540 232 L540 220 Q540 214 546 214 Q552 214 552 220 L552 230 L560 230 Z" />
        <path d="M576 230 L586 230 L586 216 Q586 210 592 210 Q598 210 598 216 L598 232 Q598 240 590 240 L576 240 Z" />
      </g>

      <rect width="1440" height="340" fill="url(#crCalShade)" />
      <rect width="1440" height="340" fill="url(#crCalFade)" />
    </svg>
  );
}
