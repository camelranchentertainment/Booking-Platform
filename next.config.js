const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  generateEtags: false,
  // pdfjs (inside pdf-parse) loads pdf.worker.mjs at runtime from a path it
  // computes, which the build's file tracing can't see. Without this the file
  // isn't shipped and every PDF upload fails on Vercel with "Setting up fake
  // worker failed: Cannot find module …/pdf.worker.mjs". Every route that
  // calls lib/server/pdfText.ts must be listed here.
  outputFileTracingIncludes: {
    '/api/import/parse': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
    '/api/parse-file': ['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
  // The Booking Agent pages moved from /booker/* to /agent/* (Oct 2026). Old
  // links, bookmarks and emails keep working through permanent redirects.
  async redirects() {
    return [
      { source: '/booker', destination: '/agent', permanent: true },
      { source: '/booker/:path*', destination: '/agent/:path*', permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'Cache-Control', value: 'no-store, must-revalidate' },
        ],
      },
    ];
  },
};

// Only wrap with Sentry when both env vars are present — avoids a
// TypeError: The "path" argument must be of type string crash when
// SENTRY_ORG / SENTRY_PROJECT are not configured in the environment.
const sentryOrg     = process.env.SENTRY_ORG;
const sentryProject = process.env.SENTRY_PROJECT;

if (sentryOrg && sentryProject) {
  module.exports = withSentryConfig(nextConfig, {
    org:                     sentryOrg,
    project:                 sentryProject,
    silent:                  !process.env.CI,
    widenClientFileUpload:   true,
    hideSourceMaps:          true,
    disableLogger:           true,
    automaticVercelMonitors: true,
  });
} else {
  module.exports = nextConfig;
}
