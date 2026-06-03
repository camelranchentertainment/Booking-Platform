const { withSentryConfig } = require('@sentry/nextjs');

/** @type {import('next').NextConfig} */
const nextConfig = {
  generateEtags: false,
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
