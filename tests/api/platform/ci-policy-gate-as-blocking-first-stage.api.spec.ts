import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { test, expect } from '../../support/fixtures/ciPolicyContext.fixture';
import { runPolicyScriptInTempRepo } from '../../support/utils/policyScriptTestHarness';

type ScriptRunResult = {
  output: string;
  status: number;
};

type BranchGuardHarnessOptions = {
  env?: Record<string, string>;
  branch?: string;
  workflow?: string;
  story?: string;
};

const FEATURE_STORY_ID = '1-1';
const FEATURE_STORY_BRANCH = 'codex/story-1-1-routeshyft-tenant-context-resolution-and-isolation-guardrails';
const FEATURE_STORY_FILE =
  '_bmad-output/implementation-artifacts/1-1-tenant-context-resolution-and-isolation-guardrails.md';
const FEATURE_STORY_KEY = FEATURE_STORY_FILE.replace('_bmad-output/implementation-artifacts/', '').replace(/\.md$/, '');

function createSprintStatus(story010Status: 'done' | 'review', correctionStatus: 'approved' | 'pending'): string {
  return `development_status:
  0-10-kernel-readiness-verification-suite: ${story010Status}
  ${FEATURE_STORY_KEY}: in-progress
course_correction:
  cc-2026-02-18:
    status: ${correctionStatus}
`;
}

function runBranchGuardInTempRepo(
  branchGuardScript: string,
  sprintStatusContents: string,
  options: BranchGuardHarnessOptions = {},
): ScriptRunResult {
  const repoDir = mkdtempSync(join(tmpdir(), 'branch-guard-harness-'));
  const sprintStatusPath = join(repoDir, '_bmad-output/implementation-artifacts/sprint-status.yaml');
  const branchGuardAbsolutePath = resolve(branchGuardScript);
  const sourceRepoRoot = resolve(dirname(branchGuardAbsolutePath), '..');
  const branch = options.branch ?? FEATURE_STORY_BRANCH;
  const workflow = options.workflow ?? 'dev-story';
  const story = options.story ?? FEATURE_STORY_FILE;

  try {
    mkdirSync(dirname(sprintStatusPath), { recursive: true });
    writeFileSync(sprintStatusPath, sprintStatusContents, 'utf8');
    writeFileSync(join(repoDir, 'README.md'), '# branch guard harness\n', 'utf8');

    const laneContextScriptSource = join(sourceRepoRoot, 'scripts/project-lane-context.js');
    const laneContextScriptTarget = join(repoDir, 'scripts/project-lane-context.js');
    if (existsSync(laneContextScriptSource)) {
      mkdirSync(dirname(laneContextScriptTarget), { recursive: true });
      copyFileSync(laneContextScriptSource, laneContextScriptTarget);
    }

    const laneConfigSource = join(sourceRepoRoot, 'docs/policies/project_lanes.json');
    const laneConfigTarget = join(repoDir, 'docs/policies/project_lanes.json');
    if (existsSync(laneConfigSource)) {
      mkdirSync(dirname(laneConfigTarget), { recursive: true });
      copyFileSync(laneConfigSource, laneConfigTarget);
    }

    execFileSync('git', ['init', '-b', 'main'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'branch-guard-harness@example.com'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Branch Guard Harness'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'seed branch guard harness'], { cwd: repoDir, stdio: 'ignore' });

    if (branch !== 'main') {
      execFileSync('git', ['checkout', '-b', branch], { cwd: repoDir, stdio: 'ignore' });
    }

    try {
      const output = execFileSync(
        'bash',
        [branchGuardAbsolutePath, '--workflow', workflow, '--story', story],
        {
          cwd: repoDir,
          env: {
            ...process.env,
            GITHUB_EVENT_NAME: 'local',
            GITHUB_HEAD_REF: '',
            GITHUB_REF_NAME: '',
            SPRINT_STATUS_FILE: sprintStatusPath,
            ...(options.env ?? {}),
          },
          encoding: 'utf8',
        },
      );

      return { output, status: 0 };
    } catch (error) {
      const typed = error as { status?: number; stdout?: string; stderr?: string };
      return {
        output: `${typed.stdout ?? ''}${typed.stderr ?? ''}`,
        status: typed.status ?? 1,
      };
    }
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
}

test.describe('Story 0.9 atdd - ci policy gate as blocking first stage API coverage', () => {
  test('[P0] local policy checks ignore env-branch spoofing and fail on actual default branch @P0', async ({
    ciPolicyContext,
  }) => {
    // Given a repository actually on main but with spoofed non-default branch env
    const { output, status } = runPolicyScriptInTempRepo(ciPolicyContext.policyScript, ciPolicyContext.policyFile, {
      branch: 'main',
      event: 'local',
      headRef: 'codex/story-9-9-routeshyft-spoofed-branch',
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
    const { output, status } = runPolicyScriptInTempRepo(ciPolicyContext.policyScript, ciPolicyContext.policyFile, {
      branch: 'codex/story-0-9-routeshyft-ci-policy-gate-as-blocking-first-stage',
      event: 'pull_request',
      headRef: 'codex/story-0-9-routeshyft-ci-policy-gate-as-blocking-first-stage',
      baseRef: 'production',
      commitSubject: '0-9: target wrong base',
    });

    // Then output should include explicit branch and base context for remediation
    const hasFailureHeadline = /Policy check failed: story pull requests must target codex\/dev/.test(output);
    const hasHeadBranchContext = /Head branch:\s*codex\/story-0-9-routeshyft-ci-policy-gate-as-blocking-first-stage/.test(
      output,
    );
    const hasBaseBranchContext = /Base branch:\s*production/.test(output);
    expect(status !== 0 && hasFailureHeadline && hasHeadBranchContext && hasBaseBranchContext).toBe(true);
  });

  test('[P1] pull-request default-branch failures include policy context and remediation guidance @P1', async ({
    ciPolicyContext,
  }) => {
    // Given a pull request that runs directly from a protected default branch
    const { output, status } = runPolicyScriptInTempRepo(ciPolicyContext.policyScript, ciPolicyContext.policyFile, {
      branch: 'main',
      event: 'pull_request',
      headRef: 'main',
      baseRef: 'production',
      commitSubject: '0-9: default branch PR',
    });

    // Then output should be actionable for remediation
    const hasFailureHeadline = /Policy check failed: pull requests must not run directly from main/.test(output);
    const hasPolicyReference = /Policy reference:\s*docs\/policies\/git_policy\.md/.test(output);
    const hasRemediationHint = /npm run branch:ensure-workflow -- --workflow code-review --story <story-key-or-story-file>/.test(
      output,
    );
    expect(status !== 0 && hasFailureHeadline && hasPolicyReference && hasRemediationHint).toBe(true);
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
          GITHUB_HEAD_REF: 'codex/story-0-9-routeshyft-ci-policy-gate-as-blocking-first-stage',
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
    // Given a local repository branch that does not match the requested story id
    const mismatchedBranch = 'codex/story-0-8-routeshyft-centralized-time-service-and-utc-local-rendering-contract';
    const { output, status } = runBranchGuardInTempRepo(
      ciPolicyContext.branchGuardScript,
      createSprintStatus('done', 'approved'),
      {
        branch: mismatchedBranch,
        workflow: '_bmad/tea/workflows/testarch/atdd/workflow.yaml',
        story: '_bmad-output/implementation-artifacts/0-9-ci-policy-gate-as-blocking-first-stage.md',
      },
    );

    // When reading guard failure diagnostics
    const hasExpectedPattern = /Expected branch pattern:\s*codex\/story-0-9-routeshyft-<slug>/.test(output);
    const hasCurrentBranch = new RegExp(`Current branch:\\s*${mismatchedBranch}`).test(output);

    // Then output should include concrete branch mismatch diagnostics
    expect(status !== 0 && hasExpectedPattern && hasCurrentBranch).toBe(true);
  });

  test('[P0] local branch guard ignores env spoofing and enforces git branch state @P0', async ({
    ciPolicyContext,
  }) => {
    // Given local execution on main with a spoofed story branch env variable
    const { output, status } = runBranchGuardInTempRepo(
      ciPolicyContext.branchGuardScript,
      createSprintStatus('done', 'approved'),
      {
        branch: 'main',
        story: '_bmad-output/implementation-artifacts/0-9-ci-policy-gate-as-blocking-first-stage.md',
        env: {
          GITHUB_HEAD_REF: 'codex/story-0-9-routeshyft-ci-policy-gate-as-blocking-first-stage',
        },
      },
    );

    // Then guard should fail using actual git branch context, not env spoof values
    const hasFailurePrefix = /Branch guard failed/.test(output);
    const hasCurrentBranch = /Current branch:\s*main/.test(output);
    expect(status !== 0 && hasFailurePrefix && hasCurrentBranch).toBe(true);
  });

  test('[P1] policy failure output includes explicit policy path and remediation commands for local runs @P1', async ({
    ciPolicyContext,
  }) => {
    // Given local execution on a protected default branch
    const { output, status } = runPolicyScriptInTempRepo(ciPolicyContext.policyScript, ciPolicyContext.policyFile, {
      branch: 'codex/dev',
      event: 'local',
      headRef: 'codex/story-0-9-routeshyft-ignored-in-local-mode',
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
      branch: 'codex/story-0-9-routeshyft-ci-policy-gate-as-blocking-first-stage',
      event: 'local',
      commitSubject: '0-8: wrong story commit subject',
    });

    // Then policy should fail with explicit branch/story mismatch context
    const hasStoryMismatchMessage = /latest commit subject must match '0-9: <summary>'/.test(output);
    const hasActualSubject = /Actual(?: \([^)]+\))?:\s*0-8: wrong story commit subject/.test(output);
    expect(status !== 0 && hasStoryMismatchMessage && hasActualSubject).toBe(true);
  });

  test('[P1] local dirty worktrees defer commit-subject enforcement unless strict override is enabled @P1', async ({
    ciPolicyContext,
  }) => {
    const branch = 'codex/story-0-9-routeshyft-ci-policy-gate-as-blocking-first-stage';
    const sprintStatus = `development_status:
  0-9-ci-policy-gate-as-blocking-first-stage: in-progress
`;
    const deferredResult = runPolicyScriptInTempRepo(ciPolicyContext.policyScript, ciPolicyContext.policyFile, {
      branch,
      event: 'local',
      commitSubject: '0-8: wrong story commit subject',
      leaveWorktreeDirty: true,
      seedFiles: {
        '_bmad-output/implementation-artifacts/sprint-status.yaml': sprintStatus,
      },
    });

    const strictResult = runPolicyScriptInTempRepo(ciPolicyContext.policyScript, ciPolicyContext.policyFile, {
      branch,
      event: 'local',
      commitSubject: '0-8: wrong story commit subject',
      leaveWorktreeDirty: true,
      seedFiles: {
        '_bmad-output/implementation-artifacts/sprint-status.yaml': sprintStatus,
      },
      env: {
        POLICY_ENFORCE_LOCAL_COMMIT_SUBJECT: 'true',
      },
    });

    const hasDeferralWarning = /Policy check warning: local worktree is dirty; deferring latest commit subject validation until commit\./.test(
      deferredResult.output,
    );
    const deferredStillPasses = deferredResult.status === 0 && /Policy check passed/.test(deferredResult.output);
    const strictModeFails = strictResult.status !== 0;
    const strictModeShowsMismatch = /latest commit subject must match '0-9: <summary>'/.test(strictResult.output);

    expect(hasDeferralWarning && deferredStillPasses && strictModeFails && strictModeShowsMismatch).toBe(true);
  });

  test('[P0] policy gate blocks non-Epic-0 story branches until Story 0.10 is marked done @P0', async ({
    ciPolicyContext,
  }) => {
    // Given CI policy evaluation on a feature-story branch with corrected-kernel gate unmet
    const { output, status } = runPolicyScriptInTempRepo(ciPolicyContext.policyScript, ciPolicyContext.policyFile, {
      branch: FEATURE_STORY_BRANCH,
      event: 'pull_request',
      headRef: FEATURE_STORY_BRANCH,
      baseRef: 'codex/dev',
      commitSubject: `${FEATURE_STORY_ID}: enforce corrected-kernel gate`,
      seedFiles: {
        '_bmad-output/implementation-artifacts/sprint-status.yaml': createSprintStatus('review', 'approved'),
      },
    });

    // Then CI policy should block workflow progression with explicit corrected-kernel context
    const hasGateFailureMessage = /corrected kernel gate unmet \(Story 0-10 is not done\)/.test(output);
    const hasPolicyReference = /Policy reference:\s*docs\/policies\/git_policy\.md/.test(output);
    const hasRemediationHint = /npm run branch:ensure-workflow -- --workflow code-review --story _bmad-output\/implementation-artifacts\/1-1-routeshyft-tenant-context-resolution-and-isolation-guardrails\.md/.test(
      output,
    );
    expect(status !== 0 && hasGateFailureMessage && hasPolicyReference && hasRemediationHint).toBe(true);
  });

  test('[P0] policy gate blocks non-Epic-0 story branches until course-correction status is approved @P0', async ({
    ciPolicyContext,
  }) => {
    // Given CI policy evaluation where Story 0.10 is done but course correction is not approved
    const { output, status } = runPolicyScriptInTempRepo(ciPolicyContext.policyScript, ciPolicyContext.policyFile, {
      branch: FEATURE_STORY_BRANCH,
      event: 'pull_request',
      headRef: FEATURE_STORY_BRANCH,
      baseRef: 'codex/dev',
      commitSubject: `${FEATURE_STORY_ID}: enforce corrected-kernel gate`,
      seedFiles: {
        '_bmad-output/implementation-artifacts/sprint-status.yaml': createSprintStatus('done', 'pending'),
      },
    });

    // Then CI policy should fail with course-correction-specific diagnostics
    const hasCourseCorrectionFailure = /corrected kernel gate unmet \(course correction cc-2026-02-18 is not approved\)/.test(
      output,
    );
    const hasPolicyReference = /Policy reference:\s*docs\/policies\/git_policy\.md/.test(output);
    const hasRemediationHint = /npm run branch:ensure-workflow -- --workflow code-review --story _bmad-output\/implementation-artifacts\/1-1-routeshyft-tenant-context-resolution-and-isolation-guardrails\.md/.test(
      output,
    );
    expect(status !== 0 && hasCourseCorrectionFailure && hasPolicyReference && hasRemediationHint).toBe(true);
  });

  test('[P0] policy gate allows non-Epic-0 story branches after corrected-kernel gate prerequisites are satisfied @P0', async ({
    ciPolicyContext,
  }) => {
    // Given CI policy evaluation with Story 0.10 done and course-correction approved
    const { output, status } = runPolicyScriptInTempRepo(ciPolicyContext.policyScript, ciPolicyContext.policyFile, {
      branch: FEATURE_STORY_BRANCH,
      event: 'pull_request',
      headRef: FEATURE_STORY_BRANCH,
      baseRef: 'codex/dev',
      commitSubject: `${FEATURE_STORY_ID}: corrected-kernel gate satisfied`,
      seedFiles: {
        '_bmad-output/implementation-artifacts/sprint-status.yaml': createSprintStatus('done', 'approved'),
      },
    });

    // Then CI policy should pass and allow downstream quality stages
    expect(status === 0 && /Policy check passed/.test(output)).toBe(true);
  });

  test('[P0] branch workflow guard blocks non-Epic-0 story execution until Story 0.10 is done @P0', async ({
    ciPolicyContext,
  }) => {
    // Given local workflow guard invocation with corrected-kernel gate unmet
    const { output, status } = runBranchGuardInTempRepo(
      ciPolicyContext.branchGuardScript,
      createSprintStatus('review', 'approved'),
    );

    // Then workflow execution should be blocked before feature-story workflow execution proceeds
    const hasKernelGateFailure = /Kernel gate failed: Story 0-10 is not done/.test(output);
    expect(status !== 0 && hasKernelGateFailure).toBe(true);
  });

  test('[P0] branch workflow guard blocks non-Epic-0 story execution until course-correction is approved @P0', async ({
    ciPolicyContext,
  }) => {
    // Given local workflow guard invocation where Story 0.10 is done but correction status is not approved
    const { output, status } = runBranchGuardInTempRepo(
      ciPolicyContext.branchGuardScript,
      createSprintStatus('done', 'pending'),
    );

    // Then workflow execution should be blocked with course-correction diagnostics
    const hasCorrectionFailure = /Kernel gate failed: course correction cc-2026-02-18 is not approved/.test(output);
    expect(status !== 0 && hasCorrectionFailure).toBe(true);
  });

  test('[P1] branch workflow guard advances past corrected-kernel gate checks when prerequisites are satisfied @P1', async ({
    ciPolicyContext,
  }) => {
    // Given local workflow guard invocation where corrected-kernel gate is satisfied
    const { output, status } = runBranchGuardInTempRepo(
      ciPolicyContext.branchGuardScript,
      createSprintStatus('done', 'approved'),
    );

    // Then corrected-kernel checks should pass and next guard should fail on missing Phase-0 readiness evidence
    const reachedPhase0Guard = /Phase-0 readiness incomplete/.test(output);
    const stillBlockedByKernelGate = /Kernel gate failed/.test(output);
    expect(status !== 0 && reachedPhase0Guard && !stillBlockedByKernelGate).toBe(true);
  });
});
