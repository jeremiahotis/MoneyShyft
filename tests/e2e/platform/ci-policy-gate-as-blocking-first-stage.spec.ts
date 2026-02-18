import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, expect } from '../../support/fixtures/ciPolicyContext.fixture';

test.describe('Story 0.9 atdd - ci policy gate as blocking first stage', () => {
  test.skip('[P0] defines policy stage before all downstream quality jobs in the CI graph @P0', async ({ ciPolicyContext }) => {
    // Given the CI workflow graph definition
    const workflow = readFileSync(ciPolicyContext.workflowFile, 'utf8');

    // When evaluating stage ordering in the workflow definition
    const policyIndex = workflow.indexOf('\n  policy:');
    const lintIndex = workflow.indexOf('\n  lint:');
    const testIndex = workflow.indexOf('\n  test:');
    const burnInIndex = workflow.indexOf('\n  burn-in:');
    const qualityGatesIndex = workflow.indexOf('\n  quality-gates:');

    // Then policy should be the first quality gate stage in the pipeline graph
    expect(
      policyIndex > -1 &&
        lintIndex > policyIndex &&
        testIndex > lintIndex &&
        burnInIndex > testIndex &&
        qualityGatesIndex > burnInIndex,
    ).toBe(true);
  });

  test.skip('[P0] blocks lint, test, burn-in, and quality-gates through explicit/transitive dependencies @P0', async ({
    ciPolicyContext,
  }) => {
    // Given the CI workflow graph definition
    const workflow = readFileSync(ciPolicyContext.workflowFile, 'utf8');

    // When evaluating dependency relationships for quality stages
    const lintNeedsPolicy = /\nlint:\s*[\s\S]*?\n\s*needs:\s*policy\b/.test(workflow);
    const testNeedsLint = /\ntest:\s*[\s\S]*?\n\s*needs:\s*lint\b/.test(workflow);
    const burnInNeedsTest = /\nburn-in:\s*[\s\S]*?\n\s*needs:\s*test\b/.test(workflow);
    const qualityGatesNeedsTestAndBurnIn = /\nquality-gates:\s*[\s\S]*?\n\s*needs:\s*\[test,\s*burn-in\]/.test(workflow);

    // Then lint/test/burn-in/gates should not proceed when policy fails
    expect(lintNeedsPolicy && testNeedsLint && burnInNeedsTest && qualityGatesNeedsTestAndBurnIn).toBe(true);
  });

  test.skip('[P1] quality-gates execution condition enforces successful upstream dependencies @P1', async ({
    ciPolicyContext,
  }) => {
    // Given quality gate job definition in CI workflow
    const workflow = readFileSync(ciPolicyContext.workflowFile, 'utf8');

    // When checking quality-gates conditional execution criteria
    const hasAlwaysGateCondition =
      /quality-gates:\s*[\s\S]*?\n\s*if:\s*always\(\)\s*&&\s*needs\.test\.result\s*==\s*'success'/.test(workflow);
    const hasBurnInSuccessOrSkipped = /\(\s*needs\.burn-in\.result\s*==\s*'success'\s*\|\|\s*needs\.burn-in\.result\s*==\s*'skipped'\s*\)/.test(
      workflow,
    );

    // Then quality gates should only execute after required successful upstream quality stages
    expect(hasAlwaysGateCondition && hasBurnInSuccessOrSkipped).toBe(true);
  });

  test.skip('[P1] report stage always publishes policy and downstream status lines in CI summary @P1', async ({
    ciPolicyContext,
  }) => {
    // Given the workflow summary/report stages
    const workflow = readFileSync(ciPolicyContext.workflowFile, 'utf8');

    // When searching for policy-first summary output lines
    const reportContainsPolicyStatus = /echo "- policy: \$\{\{ needs\.policy\.result \}\}"/.test(workflow);
    const reportContainsLintStatus = /echo "- lint: \$\{\{ needs\.lint\.result \}\}"/.test(workflow);
    const reportContainsTestStatus = /echo "- test: \$\{\{ needs\.test\.result \}\}"/.test(workflow);
    const reportContainsQualityGateStatus = /echo "- quality-gates: \$\{\{ needs\.quality-gates\.result \}\}"/.test(workflow);

    // Then summary should include policy and all quality-stage statuses
    expect(reportContainsPolicyStatus && reportContainsLintStatus && reportContainsTestStatus && reportContainsQualityGateStatus).toBe(
      true,
    );
  });

  test.skip('[P1] local policy gate failure experience includes branch-specific recovery guidance @P1', async ({
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
    const hasBranchName = /main/.test(output);
    const hasRecoveryPath = /codex\/story-0-9-ci-policy-gate-as-blocking-first-stage/.test(output);

    // Then local feedback should be actionable and branch-specific
    expect(hasViolationHeadline && hasBranchName && hasRecoveryPath).toBe(true);
  });
});
