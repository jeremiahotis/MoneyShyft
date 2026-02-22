import api from '@/services/api';

export type ConnectShyftUiFlags = {
  connectshyft_enabled: boolean;
  connectshyft_inbox_enabled: boolean;
  connectshyft_escalation_enabled: boolean;
  connectshyft_webhooks_enabled: boolean;
};

type ConnectShyftAvailabilityEnvelope = {
  data?: {
    flags?: Partial<ConnectShyftUiFlags>;
  };
};

export const DEFAULT_CONNECTSHYFT_UI_FLAGS: ConnectShyftUiFlags = {
  connectshyft_enabled: false,
  connectshyft_inbox_enabled: false,
  connectshyft_escalation_enabled: false,
  connectshyft_webhooks_enabled: false,
};

const isConnectShyftTestHarnessEnabled = (): boolean =>
  import.meta.env.DEV && import.meta.env.VITE_ENABLE_TEST_CONNECTSHYFT_FLAGS === 'true';

const parseFlagState = (value: string): boolean | null => {
  const normalized = value.trim().toLowerCase();
  if (normalized === 'on' || normalized === 'true' || normalized === '1' || normalized === 'enabled') {
    return true;
  }

  if (normalized === 'off' || normalized === 'false' || normalized === '0' || normalized === 'disabled') {
    return false;
  }

  return null;
};

const parseFlagQueryForTestOverride = (rawFlagsParam: string): ConnectShyftUiFlags => {
  const parsedFlags: ConnectShyftUiFlags = { ...DEFAULT_CONNECTSHYFT_UI_FLAGS };

  rawFlagsParam
    .split(',')
    .map((segment) => segment.trim())
    .filter((segment) => segment.includes(':'))
    .forEach((segment) => {
      const [rawKey, rawState] = segment.split(':', 2);
      const state = parseFlagState(rawState || '');
      if (state === null) {
        return;
      }

      switch (rawKey.trim().toLowerCase()) {
        case 'module':
          parsedFlags.connectshyft_enabled = state;
          break;
        case 'inbox':
          parsedFlags.connectshyft_inbox_enabled = state;
          break;
        case 'escalation':
          parsedFlags.connectshyft_escalation_enabled = state;
          break;
        case 'webhooks':
          parsedFlags.connectshyft_webhooks_enabled = state;
          break;
        default:
          break;
      }
    });

  return parsedFlags;
};

const buildTestOverrideHeaders = (): Record<string, string> => {
  if (!isConnectShyftTestHarnessEnabled() || typeof window === 'undefined') {
    return {};
  }

  const rawFlags = new URLSearchParams(window.location.search).get('flags');
  if (!rawFlags) {
    return {};
  }

  return {
    'x-test-connectshyft-flags': JSON.stringify(parseFlagQueryForTestOverride(rawFlags)),
  };
};

const toBooleanFlag = (value: unknown): boolean => value === true;

const parseServerFlags = (payload: unknown): ConnectShyftUiFlags => {
  const envelope = (payload && typeof payload === 'object')
    ? payload as ConnectShyftAvailabilityEnvelope
    : {};
  const rawFlags = envelope.data?.flags || {};

  return {
    connectshyft_enabled: toBooleanFlag(rawFlags.connectshyft_enabled),
    connectshyft_inbox_enabled: toBooleanFlag(rawFlags.connectshyft_inbox_enabled),
    connectshyft_escalation_enabled: toBooleanFlag(rawFlags.connectshyft_escalation_enabled),
    connectshyft_webhooks_enabled: toBooleanFlag(rawFlags.connectshyft_webhooks_enabled),
  };
};

export const fetchConnectShyftUiFlags = async (): Promise<ConnectShyftUiFlags> => {
  try {
    const response = await api.get('/connectshyft/availability', {
      headers: buildTestOverrideHeaders(),
    });
    return parseServerFlags(response.data);
  } catch (_error) {
    return { ...DEFAULT_CONNECTSHYFT_UI_FLAGS };
  }
};
