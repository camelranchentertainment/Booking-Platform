// components/public/landingTheme.ts
// Palette for the public marketing pages (homepage, /beta). Matches the
// constants at the top of pages/index.tsx so new public components look the
// same without duplicating hex values in each file.

export const LANDING = {
  gold:   '#E07820',
  cream:  '#EFE0BD',
  bg:     '#0D1B2A',
  dark:   '#091725',
  border: 'rgba(224,120,32,0.13)',
  muted:  'rgba(239,224,189,0.5)',
  error:  '#f87171',
} as const;
