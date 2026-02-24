import { test as base } from '@playwright/test';
import {
  createStoryC2Context,
  createStoryC2Headers,
  type StoryC2Context,
} from '../factories/connectShyftStoryC2Factory';

type StoryC2Fixtures = {
  storyC2Context: StoryC2Context;
  storyC2OperatorHeaders: Record<string, string>;
  storyC2SecondaryOperatorHeaders: Record<string, string>;
  storyC2UnauthorizedHeaders: Record<string, string>;
  storyC2EnsurePayload: {
    orgUnitId: string;
    neighborId: string;
    source: 'VOICE';
    lastInboundCsNumberId: string;
    preferredOutboundCsNumberId: string;
  };
  storyC2MalformedPayload: {
    orgUnitId: string;
    neighborId: '';
    source: 'VOICE';
  };
};

export const test = base.extend<StoryC2Fixtures>({
  storyC2Context: async ({}, use) => {
    await use(createStoryC2Context());
  },
  storyC2OperatorHeaders: async ({ storyC2Context }, use) => {
    await use(
      createStoryC2Headers(storyC2Context, {
        orgUnitMemberships: [storyC2Context.orgUnitId],
      }),
    );
  },
  storyC2SecondaryOperatorHeaders: async ({ storyC2Context }, use) => {
    await use(
      createStoryC2Headers(storyC2Context, {
        userId: storyC2Context.secondaryActorUserId,
        orgUnitMemberships: [storyC2Context.orgUnitId],
      }),
    );
  },
  storyC2UnauthorizedHeaders: async ({ storyC2Context }, use) => {
    await use(
      createStoryC2Headers(storyC2Context, {
        role: 'TENANT_VIEWER',
        userId: storyC2Context.unauthorizedActorUserId,
        orgUnitMemberships: [],
      }),
    );
  },
  storyC2EnsurePayload: async ({ storyC2Context }, use) => {
    await use({
      orgUnitId: storyC2Context.orgUnitId,
      neighborId: storyC2Context.neighborId,
      source: 'VOICE',
      lastInboundCsNumberId: storyC2Context.inboundCsNumberId,
      preferredOutboundCsNumberId: storyC2Context.preferredOutboundCsNumberId,
    });
  },
  storyC2MalformedPayload: async ({ storyC2Context }, use) => {
    await use({
      orgUnitId: storyC2Context.orgUnitId,
      neighborId: '',
      source: 'VOICE',
    });
  },
});

export { expect } from '@playwright/test';
