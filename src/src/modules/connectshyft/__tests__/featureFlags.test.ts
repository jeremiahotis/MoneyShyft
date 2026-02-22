import type { Request } from 'express';
import {
  evaluateConnectShyftCapability,
  resolveConnectShyftFeatureFlags,
} from '../featureFlags';

const createRequest = (headerValue?: string): Pick<Request, 'header'> => ({
  header: ((name: string) => {
    if (name.toLowerCase() !== 'x-test-connectshyft-flags') {
      return undefined;
    }

    return headerValue;
  }) as Request['header'],
});

describe('connectshyft feature flag resolution', () => {
  it('defaults to fail-closed flags when header is missing', () => {
    const flags = resolveConnectShyftFeatureFlags(createRequest());
    expect(flags).toEqual({
      connectshyft_enabled: false,
      connectshyft_inbox_enabled: false,
      connectshyft_escalation_enabled: false,
      connectshyft_webhooks_enabled: false,
    });
  });

  it('defaults to fail-closed flags when header payload is invalid', () => {
    const flags = resolveConnectShyftFeatureFlags(createRequest('not-json'));
    expect(flags).toEqual({
      connectshyft_enabled: false,
      connectshyft_inbox_enabled: false,
      connectshyft_escalation_enabled: false,
      connectshyft_webhooks_enabled: false,
    });
  });

  it('parses boolean feature flag values from test header', () => {
    const flags = resolveConnectShyftFeatureFlags(createRequest(JSON.stringify({
      connectshyft_enabled: true,
      connectshyft_inbox_enabled: true,
      connectshyft_escalation_enabled: false,
      connectshyft_webhooks_enabled: true,
    })));

    expect(flags).toEqual({
      connectshyft_enabled: true,
      connectshyft_inbox_enabled: true,
      connectshyft_escalation_enabled: false,
      connectshyft_webhooks_enabled: true,
    });
  });
});

describe('connectshyft capability evaluation', () => {
  it('fails closed when module flag is disabled', () => {
    const evaluation = evaluateConnectShyftCapability({
      connectshyft_enabled: false,
      connectshyft_inbox_enabled: true,
      connectshyft_escalation_enabled: true,
      connectshyft_webhooks_enabled: true,
    }, 'inbox');

    expect(evaluation).toEqual({
      ok: false,
      code: 'CONNECTSHYFT_MODULE_DISABLED',
      message: expect.stringContaining('ConnectShyft is currently unavailable'),
      refusalType: 'business',
    });
  });

  it('allows inbox and blocks escalation when only inbox capability is enabled', () => {
    const flags = {
      connectshyft_enabled: true,
      connectshyft_inbox_enabled: true,
      connectshyft_escalation_enabled: false,
      connectshyft_webhooks_enabled: false,
    };

    expect(evaluateConnectShyftCapability(flags, 'inbox')).toEqual({ ok: true });
    expect(evaluateConnectShyftCapability(flags, 'escalation')).toEqual({
      ok: false,
      code: 'CONNECTSHYFT_ESCALATION_CAPABILITY_DISABLED',
      message: expect.stringContaining('Escalation controls'),
      refusalType: 'business',
    });
  });
});
