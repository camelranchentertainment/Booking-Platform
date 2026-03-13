// ============================================================
//  Camel Ranch Booking — Bold & Vibrant Theme
//  Import this anywhere you need color/style constants
//  Usage: import { C, font, shadow } from '../lib/theme';
// ============================================================

export const C = {
  // Backgrounds
  pageBg:      'linear-gradient(135deg, #05111f 0%, #0a1f35 100%)',
  surface:     '#0d2540',
  surfaceHi:   '#102d4a',
  surfaceMid:  '#0f2238',

  // Accent
  accent:      '#38bdf8',
  accentDark:  '#0ea5e9',
  accentDeep:  '#0369a1',
  accentGlow:  'rgba(56,189,248,0.22)',
  accentFaint: 'rgba(56,189,248,0.08)',
  accentBorder:'rgba(56,189,248,0.25)',

  // Text
  text:        '#f0f9ff',
  textMuted:   '#7db8d4',
  textFaint:   '#4a7a9b',

  // Borders & dividers
  border:      'rgba(56,189,248,0.2)',
  borderFaint: 'rgba(56,189,248,0.1)',
  divider:     '#1a3a5c',

  // Button
  btnBg:       'linear-gradient(135deg, #38bdf8, #0ea5e9)',
  btnText:     '#05111f',
  btnHover:    'linear-gradient(135deg, #7dd3fc, #38bdf8)',

  // Ghost button
  ghostBorder: 'rgba(56,189,248,0.4)',
  ghostText:   '#38bdf8',

  // Status colors (unchanged — universally understood)
  success:     '#4ade80',
  successBg:   'rgba(74,222,128,0.1)',
  successBorder:'rgba(74,222,128,0.25)',
  warning:     '#fbbf24',
  warningBg:   'rgba(251,191,36,0.1)',
  warningBorder:'rgba(251,191,36,0.25)',
  error:       '#f87171',
  errorBg:     'rgba(248,113,113,0.1)',
  errorBorder: 'rgba(248,113,113,0.25)',
  info:        '#38bdf8',
  infoBg:      'rgba(56,189,248,0.1)',
  infoBorder:  'rgba(56,189,248,0.25)',

  // Confirmed / awaiting / new — booking status chips
  statusConfirmed:   { bg:'rgba(74,222,128,0.12)',  text:'#4ade80',  border:'rgba(74,222,128,0.3)' },
  statusAwaiting:    { bg:'rgba(251,191,36,0.12)',  text:'#fbbf24',  border:'rgba(251,191,36,0.3)' },
  statusContacted:   { bg:'rgba(56,189,248,0.12)',  text:'#38bdf8',  border:'rgba(56,189,248,0.3)' },
  statusNew:         { bg:'rgba(255,255,255,0.06)', text:'#7db8d4',  border:'rgba(255,255,255,0.1)' },
  statusReplied:     { bg:'rgba(168,85,247,0.12)',  text:'#c084fc',  border:'rgba(168,85,247,0.3)' },
  statusDeclined:    { bg:'rgba(248,113,113,0.12)', text:'#f87171',  border:'rgba(248,113,113,0.3)' },
};

// Typography
export const font = {
  family: "'Segoe UI', system-ui, -apple-system, sans-serif",
  mono:   "'Cascadia Code', 'Fira Code', monospace",
};

// Common box shadows
export const shadow = {
  card:    '0 4px 24px rgba(0,0,0,0.4)',
  glow:    `0 0 20px rgba(56,189,248,0.2)`,
  btnGlow: `0 4px 18px rgba(56,189,248,0.35)`,
  inset:   'inset 0 1px 0 rgba(255,255,255,0.05)',
};

// Common border radius
export const radius = {
  sm:  '6px',
  md:  '10px',
  lg:  '14px',
  xl:  '20px',
  pill:'999px',
};

// Reusable inline style objects
export const styles = {
  page: {
    minHeight:  '100vh',
    background: C.pageBg,
    fontFamily: font.family,
    color:      C.text,
  } as React.CSSProperties,

  card: {
    background:   C.surface,
    border:       `1px solid ${C.border}`,
    borderRadius: radius.lg,
    boxShadow:    shadow.card,
  } as React.CSSProperties,

  btn: {
    background:  C.btnBg,
    color:       C.btnText,
    border:      'none',
    borderRadius: radius.md,
    fontWeight:  700,
    cursor:      'pointer',
    boxShadow:   shadow.btnGlow,
    fontFamily:  font.family,
  } as React.CSSProperties,

  btnGhost: {
    background:   'transparent',
    color:        C.ghostText,
    border:       `1px solid ${C.ghostBorder}`,
    borderRadius: radius.md,
    fontWeight:   600,
    cursor:       'pointer',
    fontFamily:   font.family,
  } as React.CSSProperties,

  label: {
    display:       'block',
    fontSize:      '11px',
    fontWeight:    700,
    color:         C.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.09em',
    marginBottom:  '7px',
  } as React.CSSProperties,

  input: {
    width:        '100%',
    padding:      '11px 14px',
    borderRadius: radius.md,
    border:       `1px solid ${C.divider}`,
    background:   'rgba(255,255,255,0.03)',
    color:        C.text,
    fontSize:     '14px',
    outline:      'none',
    boxSizing:    'border-box' as const,
    transition:   'all 0.2s',
  } as React.CSSProperties,

  sectionLabel: {
    fontSize:      '11px',
    fontWeight:    700,
    color:         C.textMuted,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.1em',
    margin:        '0 0 14px 0',
  } as React.CSSProperties,
};
