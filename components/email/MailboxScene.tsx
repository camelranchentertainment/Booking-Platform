// components/email/MailboxScene.tsx
//
// Header illustration for the Email page: the Tours desert at dusk, with a
// row of rural-route mailboxes on fence posts — one with its red flag up
// (mail to answer) and a couple of envelopes on the wind toward the sunset.
//
// Inline SVG (no network request, crisp at any width). Colours are
// illustration paint, so they are literal hex values; gradient ids are
// prefixed `crMail` so they cannot clash with another SVG on the page.

/** Mailboxes: [x, postHeight, flagUp]. */
const BOXES: ReadonlyArray<readonly [number, number, boolean]> = [
  [760, 64, false], [880, 74, true], [1000, 60, false],
];

/** Envelopes in flight: [x, y, rotation]. */
const LETTERS: ReadonlyArray<readonly [number, number, number]> = [
  [1060, 150, -14], [1130, 120, 8], [1190, 168, -6],
];

/** The decorative scene. aria-hidden: it carries no information. */
export default function MailboxScene() {
  return (
    <svg className="page-hero-art" viewBox="0 0 1440 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id="crMailSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#1B2547" />
          <stop offset="0.45" stopColor="#6B3A4E" />
          <stop offset="0.75" stopColor="#C8573A" />
          <stop offset="1" stopColor="#F09A4E" />
        </linearGradient>
        <linearGradient id="crMailShade" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#16243f" stopOpacity="0.94" />
          <stop offset="0.45" stopColor="#16243f" stopOpacity="0.55" />
          <stop offset="1" stopColor="#16243f" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="crMailFade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0.6" stopColor="#16243f" stopOpacity="0" />
          <stop offset="1" stopColor="#16243f" stopOpacity="1" />
        </linearGradient>
      </defs>

      <rect width="1440" height="340" fill="url(#crMailSky)" />
      <circle cx="1310" cy="210" r="70" fill="#F7C46A" opacity="0.16" />
      <circle cx="1310" cy="210" r="46" fill="#F7C46A" />

      <path d="M0 214 L120 214 L140 188 L310 188 L332 214 L560 214 L590 170 L700 170 L726 206 L1440 206 L1440 260 L0 260 Z" fill="#7A3B45" />
      <path d="M0 240 L380 240 L400 222 L600 222 L620 240 L1440 240 L1440 272 L0 272 Z" fill="#4A2638" />
      <rect y="258" width="1440" height="82" fill="#2A1C2E" />
      <rect y="284" width="1440" height="40" fill="#151A2B" />
      <g fill="#F5C46A">
        {Array.from({ length: 16 }, (_, i) => i * 90).map(x => <rect key={x} x={x} y="302" width="44" height="3" />)}
      </g>

      {/* Fence line */}
      <g fill="#1A1222">
        {[640, 700, 1080, 1140, 1200].map(x => <rect key={x} x={x} y="236" width="4" height="34" />)}
        <rect x="640" y="244" width="564" height="2" />
        <rect x="640" y="256" width="564" height="2" />
      </g>

      {/* Mailboxes on posts */}
      {BOXES.map(([x, h, up]) => (
        <g key={x}>
          <rect x={x + 22} y={270 - h} width="8" height={h} fill="#1A1222" />
          <path d={`M${x} ${270 - h} L${x} ${250 - h} Q${x} ${232 - h} ${x + 26} ${232 - h} Q${x + 52} ${232 - h} ${x + 52} ${250 - h} L${x + 52} ${270 - h} Z`} fill="#2B3247" />
          <path d={`M${x} ${270 - h} L${x} ${250 - h} Q${x} ${232 - h} ${x + 10} ${232 - h} L${x + 10} ${270 - h} Z`} fill="#3A4462" />
          <rect x={x + 54} y={up ? 226 - h : 246 - h} width="3" height={up ? 26 : 14} fill="#1A1222" />
          <rect x={x + 54} y={up ? 222 - h : 246 - h} width={up ? 16 : 10} height="9" fill={up ? '#E8602A' : '#5A3A44'} />
        </g>
      ))}

      {/* Envelopes on the wind */}
      {LETTERS.map(([x, y, r]) => (
        <g key={x} transform={`translate(${x} ${y}) rotate(${r})`}>
          <rect x="-18" y="-12" width="36" height="24" rx="2" fill="#F5EDD9" />
          <path d="M-18 -12 L0 2 L18 -12" fill="none" stroke="#C8573A" strokeWidth="2" strokeLinejoin="round" />
        </g>
      ))}
      <path d="M915 196 Q985 165 1042 156" fill="none" stroke="#F5EDD9" strokeWidth="1.2" strokeDasharray="4 6" opacity="0.5" />

      <rect width="1440" height="340" fill="url(#crMailShade)" />
      <rect width="1440" height="340" fill="url(#crMailFade)" />
    </svg>
  );
}
