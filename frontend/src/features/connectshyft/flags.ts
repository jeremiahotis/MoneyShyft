export type ConnectShyftUiFlags = {
  connectshyft_enabled: boolean;
  connectshyft_inbox_enabled: boolean;
  connectshyft_escalation_enabled: boolean;
  connectshyft_webhooks_enabled: boolean;
};

const DEFAULT_CONNECTSHYFT_UI_FLAGS: ConnectShyftUiFlags = {
  connectshyft_enabled: false,
  connectshyft_inbox_enabled: false,
  connectshyft_escalation_enabled: false,
  connectshyft_webhooks_enabled: false,
};

const toQueryString = (value: unknown): string => {
  if (Array.isArray(value)) {
    const firstString = value.find((entry) => typeof entry === 'string');
    return typeof firstString === 'string' ? firstString : '';
  }

  return typeof value === 'string' ? value : '';
};

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

export const parseConnectShyftUiFlags = (rawFlagsParam: unknown): ConnectShyftUiFlags => {
  const parsedFlags: ConnectShyftUiFlags = { ...DEFAULT_CONNECTSHYFT_UI_FLAGS };
  const queryValue = toQueryString(rawFlagsParam);
  if (!queryValue) {
    return parsedFlags;
  }

  queryValue
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

