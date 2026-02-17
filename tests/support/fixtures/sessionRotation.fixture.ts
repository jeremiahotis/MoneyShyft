import { test as base } from '@playwright/test';
import {
  createRefreshIssuePayload,
  createRefreshRevokePayload,
  createRefreshRotatePayload,
  createSessionHeaders,
} from '../factories/sessionRotationFactory';

type SessionRotationFixtures = {
  sessionHeaders: ReturnType<typeof createSessionHeaders>;
  refreshIssuePayload: ReturnType<typeof createRefreshIssuePayload>;
  refreshRotatePayload: ReturnType<typeof createRefreshRotatePayload>;
  refreshRevokePayload: ReturnType<typeof createRefreshRevokePayload>;
};

export const test = base.extend<SessionRotationFixtures>({
  sessionHeaders: async ({}, use) => {
    await use(createSessionHeaders());
  },
  refreshIssuePayload: async ({}, use) => {
    await use(createRefreshIssuePayload());
  },
  refreshRotatePayload: async ({}, use) => {
    await use(createRefreshRotatePayload());
  },
  refreshRevokePayload: async ({}, use) => {
    await use(createRefreshRevokePayload());
  },
});

export { expect } from '@playwright/test';
