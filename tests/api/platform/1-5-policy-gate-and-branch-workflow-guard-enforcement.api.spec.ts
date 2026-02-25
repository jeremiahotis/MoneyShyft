import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { test, expect } from '../../support/fixtures/policyWorkflowGuardStory15.fixture';
import { runPolicyScriptInTempRepo } from '../../support/utils/policyScriptTestHarness';
import { runBranchWorkflowGuardInTempRepo } from '../../support/utils/branchWorkflowGuardTestHarness';

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getJobBlock(workflow: string, jobName: string): string {
  const pattern = new RegExp(
    `(?:^|\\n)\\s{2}${escapeRegex(jobName)}:\\s*\\n([\\s\\S]*?)(?=\\n\\s{2}[A-Za-z0-9_-]+:\\s*\\n|$)`,
  );
  const match = workflow.match(pattern);
  return match?.[1] ?? '';
}

function getNeeds(jobBlock: string): string[] {
  const inlineNeeds = jobBlock.match(/^\s{4}needs:\s*([^\n]+)\s*$/m);
  if (inlineNeeds) {
    const value = inlineNeeds[1].trim();
    if (value.startsWith('[') && value.endsWith(']')) {
      return value
        .slice(1, -1)
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return value ? [value] : [];
  }

  const multilineNeeds = jobBlock.match(/^\s{4}needs:\s*\n((?:\s{6}-\s*[^\n]+\n?)+)/m);
  if (!multilineNeeds) return [];

  return multilineNeeds[1]
    .split('\n')
    .map((line) => {
      const match = line.match(/^\s{6}-\s*([^\n]+)/);
      return match ? match[1].trim() : '';
    })
    .filter(Boolean);
}

const FEATURE_STORY_SPRINT_STATUS = `development_status:
  0-10-kernel-readiness-verification-suite: done
course_correction:
  cc-2026-02-18:
    status: approved
`;

function runStatusTransitionConcurrencyHarness(storyStatusTransitionScript: string): {
  statuses: [number, number];
  outputs: [string, string];
  storyStatusLine: string;
  sprintStatusLine: string;
} {
  const repoDir = mkdtempSync(join(tmpdir(), 'status-transition-harness-'));

  try {
    mkdirSync(join(repoDir, 'scripts'), { recursive: true });
    mkdirSync(join(repoDir, 'docs/policies'), { recursive: true });
    mkdirSync(join(repoDir, '_bmad-output/implementation-artifacts'), { recursive: true });

    copyFileSync(storyStatusTransitionScript, join(repoDir, 'scripts/story-status-transition.sh'));
    copyFileSync(resolve('scripts/project-lane-context.js'), join(repoDir, 'scripts/project-lane-context.js'));
    copyFileSync(resolve('docs/policies/project_lanes.json'), join(repoDir, 'docs/policies/project_lanes.json'));

    writeFileSync(
      join(repoDir, '_bmad-output/implementation-artifacts/sprint-status.yaml'),
      `project_lane: routeshyft
development_status:
  1-5-policy-gate-and-branch-workflow-guard-enforcement: review
`,
      'utf8',
    );

    writeFileSync(
      join(repoDir, '_bmad-output/implementation-artifacts/1-5-policy-gate-and-branch-workflow-guard-enforcement.md'),
      `# Story 1.5

Status: review
`,
      'utf8',
    );

    execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'story-transition-harness@example.com'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Story Transition Harness'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'seed story transition harness'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', 'codex/story-1-5-routeshyft-policy-harness'], { cwd: repoDir, stdio: 'ignore' });

    const raceOutput = execFileSync(
      'bash',
      [
        '-c',
        [
          'set +e',
          'bash scripts/story-status-transition.sh --story-key 1-5-policy-gate-and-branch-workflow-guard-enforcement --status done --lock-timeout-seconds 15 > run1.log 2>&1 &',
          'pid1=$!',
          'bash scripts/story-status-transition.sh --story-key 1-5-policy-gate-and-branch-workflow-guard-enforcement --status done --lock-timeout-seconds 15 > run2.log 2>&1 &',
          'pid2=$!',
          'wait $pid1; s1=$?',
          'wait $pid2; s2=$?',
          'echo "$s1,$s2"',
        ].join('\n'),
      ],
      {
        cwd: repoDir,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'local',
          TMPDIR: repoDir,
        },
        encoding: 'utf8',
      },
    ).trim();

    const [status1Raw, status2Raw] = raceOutput.split(',');
    const status1 = Number.parseInt(status1Raw, 10);
    const status2 = Number.parseInt(status2Raw, 10);
    const output1 = readFileSync(join(repoDir, 'run1.log'), 'utf8');
    const output2 = readFileSync(join(repoDir, 'run2.log'), 'utf8');
    const storyStatusLine = readFileSync(
      join(repoDir, '_bmad-output/implementation-artifacts/1-5-policy-gate-and-branch-workflow-guard-enforcement.md'),
      'utf8',
    )
      .split(/\r?\n/)
      .find((line) => line.startsWith('Status:')) ?? '';
    const sprintStatusLine = readFileSync(
      join(repoDir, '_bmad-output/implementation-artifacts/sprint-status.yaml'),
      'utf8',
    )
      .split(/\r?\n/)
      .find((line) => line.includes('1-5-policy-gate-and-branch-workflow-guard-enforcement:')) ?? '';

    return {
      statuses: [status1, status2],
      outputs: [output1, output2],
      storyStatusLine,
      sprintStatusLine,
    };
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
}

function runOperabilityCloseoutHarness(operabilityGuardScript: string): { output: string; status: number } {
  const repoDir = mkdtempSync(join(tmpdir(), 'operability-closeout-harness-'));

  try {
    mkdirSync(join(repoDir, '_bmad-output/implementation-artifacts'), { recursive: true });
    mkdirSync(join(repoDir, 'scripts'), { recursive: true });
    copyFileSync(operabilityGuardScript, join(repoDir, 'scripts/enforce-operability-closeout-guard.sh'));

    const storyPath = join(
      repoDir,
      '_bmad-output/implementation-artifacts/1-5-policy-gate-and-branch-workflow-guard-enforcement.md',
    );

    writeFileSync(
      storyPath,
      `# Story 1.5

Status: review

## Operability Guardrails
- Guardrail Classification Reviewed: yes
- Critical Capability: yes
- Access-Control Story: yes
- Backend/API Implies Human Operability: yes
- Frontend/Operator Usability Criteria Included: yes
- Real-User Validation Evidence: smoke walkthrough
- Real-User Validation Result: pass
- Role-Admin UI Path: /admin/tenant
- Role-Admin UI Path Verified: yes
- Access-Control Exemption Rationale: N/A
`,
      'utf8',
    );

    execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'operability-harness@example.com'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Operability Harness'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', 'seed operability harness'], { cwd: repoDir, stdio: 'ignore' });

    writeFileSync(
      storyPath,
      `# Story 1.5

Status: done

## Operability Guardrails
- Guardrail Classification Reviewed: yes
- Critical Capability: yes
- Access-Control Story: yes
- Backend/API Implies Human Operability: yes
- Frontend/Operator Usability Criteria Included: yes
- Real-User Validation Evidence:
- Real-User Validation Result: fail
- Role-Admin UI Path: /admin/tenant
- Role-Admin UI Path Verified: yes
- Access-Control Exemption Rationale: N/A
`,
      'utf8',
    );
    execFileSync('git', ['add', '_bmad-output/implementation-artifacts/1-5-policy-gate-and-branch-workflow-guard-enforcement.md'], {
      cwd: repoDir,
      stdio: 'ignore',
    });
    execFileSync('git', ['commit', '-m', '1-5: mark done without valid operability evidence'], {
      cwd: repoDir,
      stdio: 'ignore',
    });

    try {
      const output = execFileSync('bash', ['scripts/enforce-operability-closeout-guard.sh'], {
        cwd: repoDir,
        encoding: 'utf8',
      });
      return {
        output,
        status: 0,
      };
    } catch (error) {
      const typed = error as { stdout?: string; stderr?: string; status?: number };
      return {
        output: `${typed.stdout ?? ''}${typed.stderr ?? ''}`,
        status: typed.status ?? 1,
      };
    }
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
}

test.describe('Story 1.5 policy gate and branch workflow guard enforcement API coverage', () => {
  test('[P0] enforces policy-first CI dependency chain and runs backend contracts only after quality gates @P0', async ({
    story15Context,
  }) => {
    const workflow = readFileSync(story15Context.workflowFile, 'utf8');
    const policyJob = getJobBlock(workflow, 'policy');
    const lintNeedsPolicy = getNeeds(getJobBlock(workflow, 'lint')).includes('policy');
    const testNeedsLint = getNeeds(getJobBlock(workflow, 'test')).includes('lint');
    const inlineBurnInNeedsTest = getNeeds(getJobBlock(workflow, 'burn-in')).includes('test');
    const qualityGatesNeeds = getNeeds(getJobBlock(workflow, 'quality-gates'));
    const qualityGatesNeedsTest = qualityGatesNeeds.includes('test');
    const qualityGatesNeedsBurnIn = qualityGatesNeeds.includes('burn-in');
    const backendContractsNeedsQualityGates = getNeeds(getJobBlock(workflow, 'backend-contracts')).includes(
      'quality-gates',
    );
    const policyRunsPolicyCheck = /\n\s*run:\s*npm run policy:check\b/.test(policyJob);
    const splitBurnInWorkflow = readFileSync('.github/workflows/burn-in.yml', 'utf8');
    const splitBurnInWorkflowRunTrigger =
      /workflow_run:\s*\n\s*workflows:\s*\['RouteShyft CI'\]\s*\n\s*types:\s*\[completed\]/.test(splitBurnInWorkflow);
    const splitBurnInNeedsPrepare = getNeeds(getJobBlock(splitBurnInWorkflow, 'burn-in')).includes('prepare');

    const inlineBurnInGraph =
      inlineBurnInNeedsTest && qualityGatesNeedsTest && qualityGatesNeedsBurnIn;
    const splitBurnInGraph =
      !qualityGatesNeedsBurnIn &&
      qualityGatesNeedsTest &&
      splitBurnInWorkflowRunTrigger &&
      splitBurnInNeedsPrepare;

    expect(
      policyJob.length > 0 &&
      policyRunsPolicyCheck &&
      lintNeedsPolicy &&
      testNeedsLint &&
      backendContractsNeedsQualityGates &&
      (inlineBurnInGraph || splitBurnInGraph),
    ).toBe(true);
  });

  test('[P0] rejects local default-branch runs with policy path and remediation commands @P0', async ({
    story15Context,
  }) => {
    const { output, status } = runPolicyScriptInTempRepo(story15Context.policyScript, story15Context.policyFile, {
      branch: 'codex/dev',
      event: 'local',
      headRef: story15Context.storyBranch,
      commitSubject: '1-5: policy diagnostics',
    });

    const hasFailureHeadline = /Policy check failed: branch-first policy requires a non-default branch/.test(output);
    const hasPolicyReference = /Policy reference:\s*docs\/policies\/git_policy\.md/.test(output);
    const hasStartStoryBranchHint = /npm run start:story-branch -- <story-id> <story-slug>/.test(output);
    const hasBranchGuardHint =
      /npm run branch:ensure-workflow -- --workflow dev-story --story <story-key-or-story-file>/.test(output);

    expect(status !== 0 && hasFailureHeadline && hasPolicyReference && hasStartStoryBranchHint && hasBranchGuardHint).toBe(
      true,
    );
  });

  test('[P0] rejects story workflow branch mismatch with exact expected pattern diagnostics @P0', async ({
    story15Context,
  }) => {
    const mismatchedBranch = 'codex/story-1-4-routeshyft-shared-response-envelope-and-refusal-helpers';
    const { output, status } = runBranchWorkflowGuardInTempRepo(story15Context.branchGuardScript, {
      branch: mismatchedBranch,
      workflow: '_bmad/tea/workflows/testarch/automate/workflow.yaml',
      story: story15Context.storyFile,
    });

    const hasFailurePrefix = /Branch guard failed/.test(output);
    const hasExpectedPattern = /Expected branch pattern:\s*codex\/story-1-5-routeshyft-<slug>/.test(output);
    const hasCurrentBranch = new RegExp(`Current branch:\\s*${escapeRegex(mismatchedBranch)}`).test(output);

    expect(status !== 0 && hasFailurePrefix && hasExpectedPattern && hasCurrentBranch).toBe(true);
  });

  test('[P0] pull_request policy checks validate PR head subject and cannot bypass with merge subject @P0', async ({
    story15Context,
  }) => {
    const { output, status } = runPolicyScriptInTempRepo(story15Context.policyScript, story15Context.policyFile, {
      branch: story15Context.storyBranch,
      event: 'pull_request',
      headRef: story15Context.storyBranch,
      baseRef: 'codex/dev',
      commitSubject: 'bad subject format',
      simulatePullRequestMergeCommit: true,
      prMergeSubject: 'Merge pull request #15 from codex/story-1-5-routeshyft-policy-gate-and-branch-workflow-guard-enforcement',
      seedFiles: {
        '_bmad-output/implementation-artifacts/sprint-status.yaml': FEATURE_STORY_SPRINT_STATUS,
      },
    });

    const hasFailureHeadline =
      /Policy check failed: latest commit subject must match either '<story-id>: <summary>' or '<type>: <summary>'/.test(
        output,
      );
    const indicatesPrHeadSubject = /Actual \(HEAD\^2\): bad subject format/.test(output);

    expect(status !== 0 && hasFailureHeadline && indicatesPrHeadSubject).toBe(true);
  });

  test('[P0] automation-backed status transitions are single-winner under concurrency and keep sprint/story synchronized @P0', async ({
    story15Context,
  }) => {
    const repoDir = join(__dirname, '../../artifacts', `1-5-concurrency-repo-${randomUUID()}`);
    mkdirSync(repoDir, { recursive: true });
    const transitionScript = resolve(dirname(story15Context.policyScript), 'story-status-transition.sh');
    const result = runStatusTransitionConcurrencyHarness(transitionScript);
    const successCount = result.statuses.filter((status) => status === 0).length;
    const conflictCount = result.outputs.filter((line) => /STATUS_TRANSITION_CONFLICT/.test(line)).length;

    expect(
      successCount === 1
      && conflictCount === 1
      && /Status:\s*done/.test(result.storyStatusLine)
      && /1-5-policy-gate-and-branch-workflow-guard-enforcement:\s*done/.test(result.sprintStatusLine),
    ).toBe(true);
  });

  test('[P0] operability closeout guard blocks done critical/access-control stories without real-user pass evidence @P0', async ({
    story15Context,
  }) => {
    const operabilityScript = resolve(dirname(story15Context.policyScript), 'enforce-operability-closeout-guard.sh');
    const { output, status } = runOperabilityCloseoutHarness(operabilityScript);

    expect(
      status !== 0
      && /critical\/access-control but missing real-user validation evidence/.test(output)
      && /critical\/access-control but 'Real-User Validation Result' is not 'pass'/.test(output),
    ).toBe(true);
  });

  test('[P1] rejects epic workflow branch mismatch with explicit expected epic branch diagnostic @P1', async ({
    story15Context,
  }) => {
    const { output, status } = runBranchWorkflowGuardInTempRepo(story15Context.branchGuardScript, {
      branch: story15Context.storyBranch,
      workflow: 'retrospective',
      epic: '1',
    });

    const hasFailurePrefix = /Branch guard failed/.test(output);
    const hasExpectedEpicBranch = /Expected branch:\s*codex\/epic-1-ops/.test(output);
    const hasCurrentBranch = new RegExp(`Current branch:\\s*${escapeRegex(story15Context.storyBranch)}`).test(output);

    expect(status !== 0 && hasFailurePrefix && hasExpectedEpicBranch && hasCurrentBranch).toBe(true);
  });

  test('[P1] requires --story argument for story workflows and emits explicit diagnostic @P1', async ({
    story15Context,
  }) => {
    let output = '';
    try {
      execFileSync('bash', [story15Context.branchGuardScript, '--workflow', 'automate'], {
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'local',
        },
        encoding: 'utf8',
      });
    } catch (error) {
      const typed = error as { stdout?: string; stderr?: string };
      output = `${typed.stdout ?? ''}${typed.stderr ?? ''}`;
    }

    expect(/Story workflow requires --story/.test(output)).toBe(true);
  });

  test('[P1] rejects --story flag without value using explicit missing-value diagnostic @P1', async ({
    story15Context,
  }) => {
    let output = '';
    let status = 0;
    try {
      execFileSync('bash', [story15Context.branchGuardScript, '--workflow', 'automate', '--story'], {
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'local',
        },
        encoding: 'utf8',
      });
    } catch (error) {
      const typed = error as { status?: number; stdout?: string; stderr?: string };
      status = typed.status ?? 1;
      output = `${typed.stdout ?? ''}${typed.stderr ?? ''}`;
    }

    expect(status !== 0 && /Missing value for --story/.test(output)).toBe(true);
  });

  test('[P1] rejects non-numeric epic argument with explicit epic validation diagnostic @P1', async ({
    story15Context,
  }) => {
    const { output, status } = runBranchWorkflowGuardInTempRepo(story15Context.branchGuardScript, {
      branch: story15Context.epicBranch,
      workflow: 'retrospective',
      epic: 'one',
    });

    expect(status !== 0 && /Epic value must be numeric(?: or a single letter)?\. Actual:\s*one/.test(output)).toBe(
      true,
    );
  });
});
