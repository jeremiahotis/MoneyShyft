import type { Request } from 'express';
import {
  evaluateConnectShyftCapability,
  resolveConnectShyftFeatureFlags,
} from '../featureFlags';

const ORIGINAL_ENV = { ...process.env };
const FLAG_ENV_KEYS = [
  'CONNECTSHYFT_ENABLED',
  'CONNECTSHYFT_INBOX_ENABLED',
  'CONNECTSHYFT_ESCALATION_ENABLED',
  'CONNECTSHYFT_WEBHOOKS_ENABLED',
  'ENABLE_TEST_CONNECTSHYFT_FLAGS',
] as const;

const clearConnectShyftFlagEnv = (): void => {
  FLAG_ENV_KEYS.forEach((key) => {
    delete process.env[key];
  });
};

const createRequest = (headerValue?: string): Pick<Request, 'header'> => ({
  header: ((name: string) => {
    if (name.toLowerCase() !== 'x-test-connectshyft-flags') {
      return undefined;
    }

    return headerValue;
  }) as Request['header'],
});

describe('connectshyft feature flag resolution', () => {
  beforeEach(() => {
    clearConnectShyftFlagEnv();
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('defaults to fail-closed flags when server flags are missing', () => {
    const flags = resolveConnectShyftFeatureFlags(createRequest());
    expect(flags).toEqual({
      connectshyft_enabled: false,
      connectshyft_inbox_enabled: false,
      connectshyft_escalation_enabled: false,
      connectshyft_webhooks_enabled: false,
    });
  });

  it('reads feature flags from server environment state', () => {
    process.env.CONNECTSHYFT_ENABLED = 'true';
    process.env.CONNECTSHYFT_INBOX_ENABLED = '1';
    process.env.CONNECTSHYFT_ESCALATION_ENABLED = 'off';
    process.env.CONNECTSHYFT_WEBHOOKS_ENABLED = 'enabled';

    const flags = resolveConnectShyftFeatureFlags(createRequest());
    expect(flags).toEqual({
      connectshyft_enabled: true,
      connectshyft_inbox_enabled: true,
      connectshyft_escalation_enabled: false,
      connectshyft_webhooks_enabled: true,
    });
  });

  it('ignores client test-flag headers when test override mode is disabled', () => {
    process.env.CONNECTSHYFT_ENABLED = 'false';
    process.env.CONNECTSHYFT_INBOX_ENABLED = 'false';
    process.env.CONNECTSHYFT_ESCALATION_ENABLED = 'false';
    process.env.CONNECTSHYFT_WEBHOOKS_ENABLED = 'false';

    const flags = resolveConnectShyftFeatureFlags(createRequest(JSON.stringify({
      connectshyft_enabled: true,
      connectshyft_inbox_enabled: true,
      connectshyft_escalation_enabled: true,
      connectshyft_webhooks_enabled: true,
    })));

    expect(flags).toEqual({
      connectshyft_enabled: false,
      connectshyft_inbox_enabled: false,
      connectshyft_escalation_enabled: false,
      connectshyft_webhooks_enabled: false,
    });
  });

  it('falls back to server flags when test override payload is invalid', () => {
    process.env.ENABLE_TEST_CONNECTSHYFT_FLAGS = 'true';
    process.env.CONNECTSHYFT_ENABLED = 'true';
    process.env.CONNECTSHYFT_INBOX_ENABLED = 'true';
    process.env.CONNECTSHYFT_ESCALATION_ENABLED = 'false';
    process.env.CONNECTSHYFT_WEBHOOKS_ENABLED = 'true';

    const flags = resolveConnectShyftFeatureFlags(createRequest('not-json'));
    expect(flags).toEqual({
      connectshyft_enabled: true,
      connectshyft_inbox_enabled: true,
      connectshyft_escalation_enabled: false,
      connectshyft_webhooks_enabled: true,
    });
  });

  it('allows test-flag headers only when override mode is enabled', () => {
    process.env.ENABLE_TEST_CONNECTSHYFT_FLAGS = 'true';

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
