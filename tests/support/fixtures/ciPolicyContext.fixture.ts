import { test as base } from '@playwright/test';
import {
  createCiPolicyContext,
  type CiPolicyContext,
} from '../factories/ciPolicyContextFactory';

type CiPolicyFixtures = {
  ciPolicyContext: CiPolicyContext;
};

export const test = base.extend<CiPolicyFixtures>({
  ciPolicyContext: async ({}, use) => {
    await use(createCiPolicyContext());
  },
});

export { expect } from '@playwright/test';
