import { test, expect } from '../../support/fixtures/policyWorkflowGuardStory15.fixture';
import { runPolicyScriptInTempRepo } from '../../support/utils/policyScriptTestHarness';
import { runBranchWorkflowGuardInTempRepo } from '../../support/utils/branchWorkflowGuardTestHarness';

const FEATURE_STORY_SPRINT_STATUS = `development_status:
  0-10-kernel-readiness-verification-suite: done
  1-5-policy-gate-and-branch-workflow-guard-enforcement: in-progress
course_correction:
  cc-2026-02-18:
    status: approved
`;

test.describe('Story 1.5 policy and branch guard maintainer journeys', () => {
  test('[P1] maintainer on default branch gets policy and story-guard failures with actionable guidance @P1', async ({
    story15Context,
  }) => {
    const policyResult = runPolicyScriptInTempRepo(story15Context.policyScript, story15Context.policyFile, {
      branch: 'main',
      event: 'local',
      headRef: story15Context.storyBranch,
      commitSubject: '1-5: local mismatch diagnostics',
    });

    const branchGuardResult = runBranchWorkflowGuardInTempRepo(story15Context.branchGuardScript, {
      branch: 'main',
      workflow: '_bmad/tea/workflows/testarch/atdd/workflow.yaml',
      story: story15Context.storyFile,
    });

    const policyHasRecovery =
      /Policy reference:\s*docs\/policies\/git_policy\.md/.test(policyResult.output) &&
      /npm run start:story-branch -- <story-id> <story-slug>/.test(policyResult.output);
    const branchGuardHasPatternAndCurrent =
      /Expected branch pattern:\s*codex\/story-1-5-routeshyft-<slug>/.test(branchGuardResult.output) &&
      /Current branch:\s*main/.test(branchGuardResult.output);

    expect(
      policyResult.status !== 0 && branchGuardResult.status !== 0 && policyHasRecovery && branchGuardHasPatternAndCurrent,
    ).toBe(true);
  });

  test('[P1] maintainer on valid story branch passes local policy and story workflow guard checks @P1', async ({
    story15Context,
  }) => {
    const policyResult = runPolicyScriptInTempRepo(story15Context.policyScript, story15Context.policyFile, {
      branch: story15Context.storyBranch,
      event: 'local',
      commitSubject: '1-5: story branch policy pass',
      seedFiles: {
        '_bmad-output/implementation-artifacts/sprint-status.yaml': FEATURE_STORY_SPRINT_STATUS,
      },
    });

    const branchGuardResult = runBranchWorkflowGuardInTempRepo(story15Context.branchGuardScript, {
      branch: story15Context.storyBranch,
      workflow: '_bmad/tea/workflows/testarch/automate/workflow.yaml',
      story: story15Context.storyFile,
    });

    expect(
      policyResult.status === 0 &&
        /Policy check passed/.test(policyResult.output) &&
        branchGuardResult.status === 0 &&
        /Branch guard passed for story workflow/.test(branchGuardResult.output),
    ).toBe(true);
  });

  test('[P1] epic maintainer journey accepts codex/epic-1-ops and rejects story branch reuse for epic workflows @P1', async ({
    story15Context,
  }) => {
    const passingEpicGuard = runBranchWorkflowGuardInTempRepo(story15Context.branchGuardScript, {
      branch: story15Context.epicBranch,
      workflow: 'retrospective',
      epic: '1',
    });

    const failingEpicGuard = runBranchWorkflowGuardInTempRepo(story15Context.branchGuardScript, {
      branch: story15Context.storyBranch,
      workflow: 'retrospective',
      epic: '1',
    });

    const passMessage = /Branch guard passed for epic workflow/.test(passingEpicGuard.output);
    const failMessage = /Branch guard failed/.test(failingEpicGuard.output);
    const expectedEpicBranch = /Expected branch:\s*codex\/epic-1-ops/.test(failingEpicGuard.output);

    expect(
      passingEpicGuard.status === 0 &&
        passMessage &&
        failingEpicGuard.status !== 0 &&
        failMessage &&
        expectedEpicBranch,
    ).toBe(true);
  });
});
