import { randomUUID } from 'node:crypto';

type TimezoneContextOverrides = {
  userTimezone?: string | null;
  tenantTimezone?: string;
  systemTimezone?: string;
  correlationId?: string;
};

export function createTimezoneContext(overrides: TimezoneContextOverrides = {}) {
  const hasUserTimezoneOverride = Object.prototype.hasOwnProperty.call(overrides, 'userTimezone');
  const userTimezone = hasUserTimezoneOverride ? overrides.userTimezone : 'America/New_York';
  const tenantTimezone = overrides.tenantTimezone ?? 'America/Chicago';
  const systemTimezone = overrides.systemTimezone ?? 'UTC';
  const correlationId = overrides.correlationId ?? randomUUID();

  return {
    userTimezone,
    tenantTimezone,
    systemTimezone,
    correlationId,
    headers: {
      'x-user-timezone': userTimezone ?? '',
      'x-tenant-timezone': tenantTimezone,
      'x-system-timezone': systemTimezone,
      'x-correlation-id': correlationId,
    },
  };
}
