import { execFileSync } from 'node:child_process';
import { test, expect } from '../../support/fixtures/ciPolicyContext.fixture';

test.describe('Story 0.9 atdd - ci policy gate as blocking first stage API coverage', () => {
  test.skip('[P0] fails fast on default branches during local policy check execution @P0', async ({
    ciPolicyContext,
  }) => {
    // Given a local run on a protected branch
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

    // Then policy should fail with branch-first policy context
    const hasFailurePrefix = /Policy check failed:/.test(output);
    const hasBranchFirstContext = /branch-first policy requires a non-default branch/.test(output);
    expect(hasFailurePrefix && hasBranchFirstContext).toBe(true);
  });

  test.skip('[P0] rejects story pull requests targeting non-codex\\/dev base with actionable branch context @P0', async ({
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

  test.skip('[P1] workflow guard blocks automate workflow when story argument is missing @P1', async ({
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

  test.skip('[P1] branch workflow guard failure output includes exact expected pattern and current branch @P1', async ({
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

  test.skip('[P1] policy failure output includes explicit policy path and remediation command for local runs @P1', async ({
    ciPolicyContext,
  }) => {
    // Given local execution on codex/dev branch
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

    // Then output should provide policy-document and command-level remediation hints
    const hasPolicyFileHint = /docs\/policies\/git_policy\.md/.test(output);
    const hasRemediationCommand = /npm run start:story-branch -- 0-9 ci-policy-gate-as-blocking-first-stage/.test(
      output,
    );
    expect(hasPolicyFileHint && hasRemediationCommand).toBe(true);
  });
});
