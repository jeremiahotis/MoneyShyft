import { execFileSync } from 'node:child_process';
import { test, expect } from '../../support/fixtures/ciPolicyContext.fixture';
import { runPolicyScriptInTempRepo } from '../../support/utils/policyScriptTestHarness';

test.describe('Story 0.9 atdd - ci policy gate as blocking first stage API coverage', () => {
  test('[P0] local policy checks ignore env-branch spoofing and fail on actual default branch @P0', async ({
    ciPolicyContext,
  }) => {
    // Given a repository actually on main but with spoofed non-default branch env
    const { output, status } = runPolicyScriptInTempRepo(ciPolicyContext.policyScript, ciPolicyContext.policyFile, {
      branch: 'main',
      event: 'local',
      headRef: 'codex/story-9-9-spoofed-branch',
      commitSubject: '9-9: spoof attempt',
    });

    // Then policy should fail based on real git branch state, not env spoof values
    const hasFailurePrefix = /Policy check failed:/.test(output);
    const hasBranchFirstContext = /branch-first policy requires a non-default branch/.test(output);
    const hasCurrentBranch = /Current branch:\s*main/.test(output);
    expect(status !== 0 && hasFailurePrefix && hasBranchFirstContext && hasCurrentBranch).toBe(true);
  });

  test('[P0] rejects story pull requests targeting non-codex\\/dev base with actionable branch context @P0', async ({
    ciPolicyContext,
  }) => {
    // Given a pull request from a story branch targeting the wrong base branch
    let output = '';
    try {
      execFileSync('bash', [ciPolicyContext.policyScript], {
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_HEAD_REF: 'codex/story-0-9-ci-policy-gate-as-blocking-first-stage',
          GITHUB_BASE_REF: 'production',
        },
        encoding: 'utf8',
      });
    } catch (error) {
      const typed = error as { stdout?: string; stderr?: string };
      output = `${typed.stdout ?? ''}${typed.stderr ?? ''}`;
    }

    // Then output should include explicit branch and base context for remediation
    const hasFailureHeadline = /Policy check failed: story pull requests must target codex\/dev/.test(output);
    const hasHeadBranchContext = /Head branch:\s*codex\/story-0-9-ci-policy-gate-as-blocking-first-stage/.test(
      output,
    );
    const hasBaseBranchContext = /Base branch:\s*production/.test(output);
    expect(hasFailureHeadline && hasHeadBranchContext && hasBaseBranchContext).toBe(true);
  });

  test('[P1] pull-request default-branch failures include policy context and remediation guidance @P1', async ({
    ciPolicyContext,
  }) => {
    // Given a pull request that runs directly from a protected default branch
    let output = '';
    try {
      execFileSync('bash', [ciPolicyContext.policyScript], {
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'pull_request',
          GITHUB_HEAD_REF: 'main',
          GITHUB_BASE_REF: 'production',
        },
        encoding: 'utf8',
      });
    } catch (error) {
      const typed = error as { stdout?: string; stderr?: string };
      output = `${typed.stdout ?? ''}${typed.stderr ?? ''}`;
    }

    // Then output should be actionable for remediation
    const hasFailureHeadline = /Policy check failed: pull requests must not run directly from main/.test(output);
    const hasPolicyReference = /Policy reference:\s*docs\/policies\/git_policy\.md/.test(output);
    const hasRemediationHint = /npm run branch:ensure-workflow -- --workflow code-review --story <story-key-or-story-file>/.test(
      output,
    );
    expect(hasFailureHeadline && hasPolicyReference && hasRemediationHint).toBe(true);
  });

  test('[P1] workflow guard blocks automate workflow when story argument is missing @P1', async ({
    ciPolicyContext,
  }) => {
    // Given automate workflow validation without required --story input
    let output = '';
    try {
      execFileSync('bash', [ciPolicyContext.branchGuardScript, '--workflow', 'automate'], {
        env: {
          ...process.env,
          GITHUB_HEAD_REF: 'codex/story-0-9-ci-policy-gate-as-blocking-first-stage',
        },
        encoding: 'utf8',
      });
    } catch (error) {
      const typed = error as { stdout?: string; stderr?: string };
      output = `${typed.stdout ?? ''}${typed.stderr ?? ''}`;
    }

    // Then output should include a clear missing-argument diagnostic
    expect(/Story workflow requires --story/.test(output)).toBe(true);
  });

  test('[P1] branch workflow guard failure output includes exact expected pattern and current branch @P1', async ({
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

    // Then output should include concrete branch mismatch diagnostics
    expect(hasExpectedPattern && hasCurrentBranch).toBe(true);
  });

  test('[P1] policy failure output includes explicit policy path and remediation commands for local runs @P1', async ({
    ciPolicyContext,
  }) => {
    // Given local execution on a protected default branch
    const { output, status } = runPolicyScriptInTempRepo(ciPolicyContext.policyScript, ciPolicyContext.policyFile, {
      branch: 'codex/dev',
      event: 'local',
      headRef: 'codex/story-0-9-ignored-in-local-mode',
      commitSubject: '0-9: local default branch run',
    });

    // Then output should provide policy-document and command-level remediation hints
    const hasPolicyFileHint = /Policy reference:\s*docs\/policies\/git_policy\.md/.test(output);
    const hasRemediationCommand = /npm run start:story-branch -- <story-id> <story-slug>/.test(output);
    const hasWorkflowGuardHint = /npm run branch:ensure-workflow -- --workflow dev-story --story <story-key-or-story-file>/.test(
      output,
    );
    expect(status !== 0 && hasPolicyFileHint && hasRemediationCommand && hasWorkflowGuardHint).toBe(true);
  });

  test('[P1] story branches require matching commit subject story id @P1', async ({ ciPolicyContext }) => {
    // Given a story branch with a mismatched latest commit subject story id
    const { output, status } = runPolicyScriptInTempRepo(ciPolicyContext.policyScript, ciPolicyContext.policyFile, {
      branch: 'codex/story-0-9-ci-policy-gate-as-blocking-first-stage',
      event: 'local',
      commitSubject: '0-8: wrong story commit subject',
    });

    // Then policy should fail with explicit branch/story mismatch context
    const hasStoryMismatchMessage = /latest commit subject must match '0-9: <summary>'/.test(output);
    const hasActualSubject = /Actual:\s*0-8: wrong story commit subject/.test(output);
    expect(status !== 0 && hasStoryMismatchMessage && hasActualSubject).toBe(true);
  });
});
