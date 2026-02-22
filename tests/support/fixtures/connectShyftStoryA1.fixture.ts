import { test as base } from '@playwright/test';
import {
  createStoryA1Context,
  createStoryA1FlagHeaders,
  storyA1FlagSets,
  type StoryA1Context,
} from '../factories/connectShyftStoryA1Factory';

type StoryA1Fixtures = {
  storyA1Context: StoryA1Context;
  storyA1FlagsOffHeaders: Record<string, string>;
  storyA1InboxOnlyHeaders: Record<string, string>;
  storyA1InboxAndEscalationHeaders: Record<string, string>;
  storyA1AllEnabledHeaders: Record<string, string>;
  storyA1InboxDisabledHeaders: Record<string, string>;
};

export const test = base.extend<StoryA1Fixtures>({
  storyA1Context: async ({}, use) => {
    await use(createStoryA1Context());
  },
  storyA1FlagsOffHeaders: async ({ storyA1Context }, use) => {
    await use(createStoryA1FlagHeaders(storyA1Context, storyA1FlagSets.off));
  },
  storyA1InboxOnlyHeaders: async ({ storyA1Context }, use) => {
    await use(createStoryA1FlagHeaders(storyA1Context, storyA1FlagSets.inboxOnly));
  },
  storyA1InboxAndEscalationHeaders: async ({ storyA1Context }, use) => {
    await use(
      createStoryA1FlagHeaders(storyA1Context, storyA1FlagSets.inboxAndEscalation),
    );
  },
  storyA1AllEnabledHeaders: async ({ storyA1Context }, use) => {
    await use(createStoryA1FlagHeaders(storyA1Context, storyA1FlagSets.allEnabled));
  },
  storyA1InboxDisabledHeaders: async ({ storyA1Context }, use) => {
    await use(
      createStoryA1FlagHeaders(storyA1Context, storyA1FlagSets.inboxDisabled),
    );
  },
});

export { expect } from '@playwright/test';
