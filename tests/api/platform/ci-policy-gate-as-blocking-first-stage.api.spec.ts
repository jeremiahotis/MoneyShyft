import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, expect } from '../../support/fixtures/ciPolicyContext.fixture';

test.describe('Story 0.9 atdd - ci policy gate as blocking first stage API coverage', () => {
  test.skip('[P0] requires policy as explicit blocking dependency for all downstream quality jobs @P0', async ({
    ciPolicyContext,
  }) => {
    // Given the CI workflow specification for policy-first execution
    const workflow = readFileSync(ciPolicyContext.workflowFile, 'utf8');

    // When checking downstream job dependency declarations
    const lintNeedsPolicy = /\nlint:\s*[\s\S]*?\n\s*needs:\s*policy\b/.test(workflow);
    const testNeedsPolicy = /\ntest:\s*[\s\S]*?\n\s*needs:\s*\[[^\]]*policy[^\]]*\]/.test(workflow);
    const burnInNeedsPolicy = /\nburn-in:\s*[\s\S]*?\n\s*needs:\s*\[[^\]]*policy[^\]]*\]/.test(workflow);
    const qualityGatesNeedsPolicy = /\nquality-gates:\s*[\s\S]*?\n\s*needs:\s*\[[^\]]*policy[^\]]*\]/.test(workflow);

    // Then policy must be a direct first-stage blocker for all downstream quality jobs
    expect(lintNeedsPolicy && testNeedsPolicy && burnInNeedsPolicy && qualityGatesNeedsPolicy).toBe(true);
  });

  test.skip('[P0] policy check failure output includes branch, policy path, and remediation command @P0', async ({
    ciPolicyContext,
  }) => {
    // Given a simulated local run on a protected default branch
    let output = '';
    try {
      execFileSync('bash', [ciPolicyContext.policyScript], {
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'local',
          GITHUB_HEAD_REF: 'codex/dev',
        },
        encoding: 'utf8',
      });
    } catch (error) {
      const typed = error as { stdout?: string; stderr?: string };
      output = `${typed.stdout ?? ''}${typed.stderr ?? ''}`;
    }

    // When evaluating policy violation messaging quality
    const hasBranchContext = /Current branch:\s*codex\/dev/.test(output);
    const hasPolicyPath = /docs\/policies\/git_policy\.md/.test(output);
    const hasRemediationCommand = /npm run start:story-branch --/.test(output);

    // Then output must be actionable for immediate remediation
    expect(hasBranchContext && hasPolicyPath && hasRemediationCommand).toBe(true);
  });

  test.skip('[P1] branch workflow guard failure output includes exact expected pattern and next-step command @P1', async ({
    ciPolicyContext,
  }) => {
    // Given a mismatched story branch for workflow execution
    let output = '';
    try {
      execFileSync(
        'bash',
        [
          ciPolicyContext.branchGuardScript,
          '--workflow',
          '_bmad/tea/workflows/testarch/atdd/workflow.yaml',
          '--story',
          '_bmad-output/implementation-artifacts/0-9-ci-policy-gate-as-blocking-first-stage.md',
        ],
        {
          env: {
            ...process.env,
            GITHUB_HEAD_REF: 'codex/story-0-8-centralized-time-service-and-utc-local-rendering-contract',
          },
          encoding: 'utf8',
        },
      );
    } catch (error) {
      const typed = error as { stdout?: string; stderr?: string };
      output = `${typed.stdout ?? ''}${typed.stderr ?? ''}`;
    }

    // When reading guard failure diagnostics
    const hasExpectedPattern = /Expected branch pattern:\s*codex\/story-0-9-<slug>/.test(output);
    const hasCurrentBranch = /Current branch:\s*codex\/story-0-8-centralized-time-service-and-utc-local-rendering-contract/.test(
      output,
    );
    const hasNextStepCommand = /npm run start:story-branch -- 0-9 ci-policy-gate-as-blocking-first-stage/.test(output);

    // Then output should include concrete diagnostics and a direct next step
    expect(hasExpectedPattern && hasCurrentBranch && hasNextStepCommand).toBe(true);
  });
});
