import type { NextApiRequest, NextApiResponse } from 'next';

const flags = { socials: false };
jest.mock('../../lib/featureFlags', () => ({
  FEATURES: flags,
  isFeatureEnabled: (name: keyof typeof flags) => flags[name],
}));

import { withFeature } from '../../lib/server/featureGate';

function mockRes() {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });
  return { res: { status, json } as unknown as NextApiResponse, status, json };
}
const req = { method: 'GET', headers: {}, query: {} } as unknown as NextApiRequest;

describe('withFeature', () => {
  afterEach(() => { flags.socials = false; });

  it('answers 404 FEATURE_DISABLED and never runs the handler when the feature is off', async () => {
    const inner = jest.fn();
    const { res, status, json } = mockRes();
    await withFeature('socials', inner)(req, res);
    expect(inner).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(404);
    expect(json).toHaveBeenCalledWith({
      error: { code: 'FEATURE_DISABLED', message: 'This feature is not available yet.' },
    });
  });

  it('passes the request straight through when the feature is on', async () => {
    flags.socials = true;
    const inner = jest.fn();
    const { res, status } = mockRes();
    await withFeature('socials', inner)(req, res);
    expect(inner).toHaveBeenCalledWith(req, res);
    expect(status).not.toHaveBeenCalled();
  });
});
