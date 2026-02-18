import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, expect } from '../../support/fixtures/ciPolicyContext.fixture';

test.describe('Story 0.9 atdd - ci policy gate as blocking first stage', () => {
  test.skip('[P0] blocks downstream quality graph when policy gate fails @P0', async ({ ciPolicyContext }) => {
    // Given the CI workflow graph definition
    const workflow = readFileSync(ciPolicyContext.workflowFile, 'utf8');

    // When evaluating dependency relationships for quality stages
    const testIsBlockedByPolicy = /\ntest:\s*[\s\S]*?\n\s*needs:\s*\[[^\]]*policy[^\]]*\]/.test(workflow);
    const burnInIsBlockedByPolicy = /\nburn-in:\s*[\s\S]*?\n\s*needs:\s*\[[^\]]*policy[^\]]*\]/.test(workflow);
    const qualityGatesIsBlockedByPolicy = /\nquality-gates:\s*[\s\S]*?\n\s*needs:\s*\[[^\]]*policy[^\]]*\]/.test(workflow);

    // Then lint/test/burn-in/gates should all be blocked by the policy stage
    expect(testIsBlockedByPolicy && burnInIsBlockedByPolicy && qualityGatesIsBlockedByPolicy).toBe(true);
  });

  test.skip('[P1] CI summary includes actionable policy violation context when policy stage fails @P1', async ({
    ciPolicyContext,
  }) => {
    // Given the workflow summary/report stages
    const workflow = readFileSync(ciPolicyContext.workflowFile, 'utf8');

    // When searching for policy-specific actionable summary output
    const reportContainsPolicyStatus = /echo "- policy: \$\{\{ needs\.policy\.result \}\}"/.test(workflow);
    const reportContainsViolationContext = /policy violation/i.test(workflow);
    const reportContainsRemediationHint = /start:story-branch|branch:ensure-workflow/.test(workflow);

    // Then summary should include status, violation context, and remediation hints
    expect(
      reportContainsPolicyStatus && reportContainsViolationContext && reportContainsRemediationHint,
    ).toBe(true);
  });

  test.skip('[P1] local policy gate failure experience mirrors CI-level actionable diagnostics @P1', async ({
    ciPolicyContext,
  }) => {
    // Given local execution on a protected default branch
    let output = '';
    try {
      execFileSync('bash', [ciPolicyContext.policyScript], {
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'local',
          GITHUB_HEAD_REF: 'main',
        },
        encoding: 'utf8',
      });
    } catch (error) {
      const typed = error as { stdout?: string; stderr?: string };
      output = `${typed.stdout ?? ''}${typed.stderr ?? ''}`;
    }

    // When validating local diagnostics quality
    const hasViolationHeadline = /Policy check failed:/.test(output);
    const hasBranchName = /Current branch:\s*main/.test(output);
    const hasRecoveryPath = /codex\/story-0-9-ci-policy-gate-as-blocking-first-stage/.test(output);

    // Then local feedback should be actionable and branch-specific
    expect(hasViolationHeadline && hasBranchName && hasRecoveryPath).toBe(true);
  });
});
