// components/bookings/MarqueeScene.tsx
//
// Header illustration for Bookings: a roadhouse at dusk with a lit marquee
// sign — rows of bulbs around blank letter rails — and a string of tour dates
// as glowing pennants. Same desert-dusk family as the Tours highway and the
// other page heroes.
//
// Inline SVG; colours are illustration paint (literal hex). ids are prefixed
// `crBook` so they never clash with another SVG on the page. The left side is
// shaded so the page title stays readable. aria-hidden: decorative.

const BULBS_X = Array.from({ length: 21 }, (_, i) => 862 + i * 22);
const BULBS_Y = Array.from({ length: 5 }, (_, i) => 92 + i * 22);

/** The decorative scene. */
export default function MarqueeScene() {
  return (
    <svg className="page-hero-art" viewBox="0 0 1440 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crBookSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#141c3c" />
          <stop offset="0.5" stopColor="#3d2a58" />
          <stop offset="0.82" stopColor="#a8484a" />
          <stop offset="1" stopColor="#e8823a" />
        </linearGradient>
        <radialGradient id="crBookGlow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffcf7a" stopOpacity="0.5" />
          <stop offset="1" stopColor="#ffcf7a" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="crBookShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.95" />
          <stop offset="0.42" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crBookFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.62" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crBookSky)" />
      {[[620, 40], [720, 78], [1250, 34], [1360, 80], [800, 24], [1180, 60]].map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="#ffe9c7" opacity="0.7" />
      ))}

      {/* distant mesas */}
      <path d="M520 262 L580 230 L660 230 L700 256 L800 256 L800 262 Z" fill="#5a2e44" opacity="0.7" />
      <path d="M1300 262 L1340 236 L1420 236 L1440 250 L1440 262 Z" fill="#5a2e44" opacity="0.6" />

      {/* the roadhouse */}
      <rect x="820" y="176" width="520" height="86" fill="#24162c" />
      <path d="M800 180 L1080 140 L1360 180 Z" fill="#1a1222" />
      {/* lit windows + door */}
      {[860, 940, 1200, 1270].map(x => (
        <rect key={x} x={x} y="200" width="44" height="28" rx="2" fill="#ffc46b" opacity="0.85" />
      ))}
      <rect x="1056" y="196" width="48" height="66" rx="2" fill="#ff9d4d" opacity="0.9" />
      <ellipse cx="1080" cy="240" rx="260" ry="60" fill="url(#crBookGlow)" />

      {/* marquee sign on posts */}
      <rect x="884" y="150" width="8" height="34" fill="#1a1222" />
      <rect x="1268" y="150" width="8" height="34" fill="#1a1222" />
      <rect x="850" y="80" width="460" height="104" rx="6" fill="#2a1830" stroke="#e8823a" strokeWidth="3" />
      {/* bulbs around the frame */}
      {BULBS_X.map((x, i) => (
        <g key={`t${x}`}>
          <circle cx={x} cy="80" r="4" fill={i % 2 ? '#ffe08a' : '#ffc46b'} />
          <circle cx={x} cy="184" r="4" fill={i % 2 ? '#ffc46b' : '#ffe08a'} />
        </g>
      ))}
      {BULBS_Y.map(y => (
        <g key={`s${y}`}>
          <circle cx="850" cy={y} r="4" fill="#ffe08a" />
          <circle cx="1310" cy={y} r="4" fill="#ffe08a" />
        </g>
      ))}
      {/* letter rails with abstract "letters" (blocks), the bill for the week */}
      {[104, 132, 160].map((y, row) => (
        <g key={y}>
          <rect x="872" y={y + 14} width="416" height="2" fill="#4a3150" />
          {Array.from({ length: 12 - row * 2 }, (_, i) => (
            <rect key={i} x={884 + i * 33 + row * 20} y={y - 4} width={18 + ((i + row) % 3) * 4} height="16" rx="2"
              fill={row === 0 ? '#f5ede2' : '#e8823a'} opacity={row === 0 ? 0.92 : 0.8} />
          ))}
        </g>
      ))}

      {/* pennant string of upcoming dates */}
      <path d="M560 120 Q 700 160 840 128" fill="none" stroke="#1a1222" strokeWidth="2" />
      {[600, 650, 700, 750, 800].map((x, i) => {
        const y = 128 + Math.sin((i / 4) * Math.PI) * 22;
        return <path key={x} d={`M${x - 10} ${y} L${x + 10} ${y} L${x} ${y + 20} Z`} fill={i % 2 ? '#4a90e2' : '#e8823a'} opacity="0.9" />;
      })}

      {/* parked van */}
      <g transform="translate(1150 236)">
        <rect x="0" y="0" width="120" height="34" rx="6" fill="#120c18" />
        <rect x="88" y="-12" width="30" height="16" rx="4" fill="#120c18" />
        <circle cx="24" cy="36" r="9" fill="#0a0710" />
        <circle cx="96" cy="36" r="9" fill="#0a0710" />
      </g>

      <rect x="0" y="262" width="1440" height="80" fill="#1a1222" />
      <rect width="1440" height="340" fill="url(#crBookShade)" />
      <rect width="1440" height="340" fill="url(#crBookFade)" />
    </svg>
  );
}
