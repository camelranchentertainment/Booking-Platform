import type { NextApiRequest, NextApiResponse } from 'next';
import { isFeatureEnabled, type FeatureName } from '../featureFlags';

type ApiHandler = (req: NextApiRequest, res: NextApiResponse) => unknown;

/**
 * Wraps an API route so it answers 404 FEATURE_DISABLED while the named
 * feature is switched off in lib/featureFlags.ts. The flag is read on every
 * request (not at import time) so tests can toggle it with jest.mock.
 *
 * This is a product switch, not a security control — the wrapped handler
 * keeps all of its own auth and role checks.
 */
export function withFeature(name: FeatureName, handler: ApiHandler): ApiHandler {
  return (req, res) => {
    if (!isFeatureEnabled(name)) {
      return res.status(404).json({
        error: { code: 'FEATURE_DISABLED', message: 'This feature is not available yet.' },
      });
    }
    return handler(req, res);
  };
}
