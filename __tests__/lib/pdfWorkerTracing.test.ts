// __tests__/lib/pdfWorkerTracing.test.ts
//
// Regression: pdfjs loads pdf.worker.mjs from a path it computes at runtime, so
// Vercel's file tracing never shipped it and every PDF upload failed in
// production with "Setting up fake worker failed: Cannot find module
// …/pdf.worker.mjs". next.config.js now lists the file for each route that
// reads PDFs. This test fails if a new API route calls lib/server/pdfText.ts
// without being added there, or if the listed file stops existing.

import fs from 'fs';
import path from 'path';

const ROOT = path.join(__dirname, '..', '..');
const WORKER = './node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs';

// next.config.js only wraps with Sentry when its env vars are set; the plain
// config object is what the test reads.
delete process.env.SENTRY_ORG;
delete process.env.SENTRY_PROJECT;
const nextConfig = require(path.join(ROOT, 'next.config.js')) as {
  outputFileTracingIncludes?: Record<string, string[]>;
};

/** Every file under pages/api, recursively. */
function apiFiles(dir = path.join(ROOT, 'pages', 'api')): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return apiFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** pages/api/import/parse.ts → /api/import/parse */
function routeOf(file: string): string {
  const rel = path.relative(path.join(ROOT, 'pages'), file).replace(/\\/g, '/').replace(/\.tsx?$/, '');
  return `/${rel.replace(/\/index$/, '')}`;
}

const pdfRoutes = apiFiles()
  .filter(f => /lib\/server\/pdfText['"]/.test(fs.readFileSync(f, 'utf8')))
  .map(routeOf);

describe('PDF worker is shipped with every route that reads PDFs', () => {
  it('finds the routes that read PDFs', () => {
    expect(pdfRoutes).toEqual(expect.arrayContaining(['/api/import/parse', '/api/parse-file']));
  });

  it.each(pdfRoutes)('%s includes pdf.worker.mjs in its traced files', route => {
    expect(nextConfig.outputFileTracingIncludes?.[route]).toContain(WORKER);
  });

  it('points at a file that exists', () => {
    expect(fs.existsSync(path.join(ROOT, WORKER))).toBe(true);
  });
});
