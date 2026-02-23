import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test, expect } from '../../support/fixtures/policyWorkflowGuardStory15.fixture';
import { runPolicyScriptInTempRepo } from '../../support/utils/policyScriptTestHarness';
import { runBranchWorkflowGuardInTempRepo } from '../../support/utils/branchWorkflowGuardTestHarness';
import { runStoryStatusTransitionInTempRepo } from '../../support/utils/storyStatusTransitionTestHarness';

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

test.describe('Story 1.5 policy gate and branch workflow guard enforcement API coverage', () => {
  test('[P0] enforces policy-first CI dependency chain and runs backend contracts only after quality gates @P0', async ({
    story15Context,
  }) => {
    const workflow = readFileSync(story15Context.workflowFile, 'utf8');
    const policyJob = getJobBlock(workflow, 'policy');
    const lintNeedsPolicy = getNeeds(getJobBlock(workflow, 'lint')).includes('policy');
    const testNeedsLint = getNeeds(getJobBlock(workflow, 'test')).includes('lint');
    const burnInNeedsTest = getNeeds(getJobBlock(workflow, 'burn-in')).includes('test');
    const qualityGatesNeeds = getNeeds(getJobBlock(workflow, 'quality-gates'));
    const qualityGatesBlockedByTestAndBurnIn =
      qualityGatesNeeds.includes('test') && qualityGatesNeeds.includes('burn-in');
    const backendContractsNeedsQualityGates = getNeeds(getJobBlock(workflow, 'backend-contracts')).includes(
      'quality-gates',
    );
    const policyRunsPolicyCheck = /\n\s*run:\s*npm run policy:check\b/.test(policyJob);

    expect(
      policyJob.length > 0 &&
        policyRunsPolicyCheck &&
        lintNeedsPolicy &&
        testNeedsLint &&
        burnInNeedsTest &&
        qualityGatesBlockedByTestAndBurnIn &&
        backendContractsNeedsQualityGates,
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

  test('[P1] enforces story-status sync against the active project lane sprint-status file @P1', async ({
    story15Context,
  }) => {
    const connectStoryKey = '1-2-tenant-and-module-entitlement-administration';
    const connectStoryFile = `# Story ${connectStoryKey}

Status: done
`;
    const connectSprintStatus = `project_lane: connectshyft
development_status:
  0-10-kernel-readiness-verification-suite: done
  ${connectStoryKey}: review
course_correction:
  cc-2026-02-18:
    status: approved
`;
    const routeSprintStatus = `project_lane: routeshyft
development_status:
  ${connectStoryKey}: done
`;

    const { output, status } = runPolicyScriptInTempRepo(story15Context.policyScript, story15Context.policyFile, {
      branch: 'codex/story-1-2-connectshyft-tenant-and-module-entitlement-administration',
      event: 'local',
      commitSubject: '1-2: validate connect lane status sync',
      seedFiles: {
        [`_bmad-output/implementation-artifacts/${connectStoryKey}.md`]: connectStoryFile,
        '_bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml': connectSprintStatus,
        '_bmad-output/implementation-artifacts/sprint-status.yaml': routeSprintStatus,
      },
    });

    const hasMismatch = /Status sync mismatch: 1-2-tenant-and-module-entitlement-administration story='done' sprint='review'/.test(
      output,
    );

    expect(status !== 0 && hasMismatch).toBe(true);
  });


  test('[P1] rejects story Status-only edits that bypass sprint-status transition coupling @P1', async ({
    story15Context,
  }) => {
    const storyKey = '1-2-tenant-and-module-entitlement-administration';
    const { output, status } = runPolicyScriptInTempRepo(story15Context.policyScript, story15Context.policyFile, {
      branch: 'codex/story-1-2-connectshyft-tenant-and-module-entitlement-administration',
      event: 'local',
      commitSubject: '1-2: bypass status coupling guard',
      seedFiles: {
        [`_bmad-output/implementation-artifacts/${storyKey}.md`]: `# Story ${storyKey}

Status: review
`,
        '_bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml': `project_lane: connectshyft
development_status:
  0-10-kernel-readiness-verification-suite: done
  ${storyKey}: review
course_correction:
  cc-2026-02-18:
    status: approved
`,
      },
      workingTreeFiles: {
        [`_bmad-output/implementation-artifacts/${storyKey}.md`]: `# Story ${storyKey}

Status: done
`,
      },
    });

    const hasGuardFailure = /Status transition guard failed: story '1-2-tenant-and-module-entitlement-administration' changed Status: without matching sprint-status development_status update\./.test(
      output,
    );

    expect(status !== 0 && hasGuardFailure).toBe(true);
  });

  test('[P1] rejects sprint-status-only edits that bypass story Status transition coupling @P1', async ({
    story15Context,
  }) => {
    const storyKey = '1-2-tenant-and-module-entitlement-administration';
    const { output, status } = runPolicyScriptInTempRepo(story15Context.policyScript, story15Context.policyFile, {
      branch: 'codex/story-1-2-connectshyft-tenant-and-module-entitlement-administration',
      event: 'local',
      commitSubject: '1-2: bypass sprint-only status edit',
      seedFiles: {
        [`_bmad-output/implementation-artifacts/${storyKey}.md`]: `# Story ${storyKey}

Status: review
`,
        '_bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml': `project_lane: connectshyft
development_status:
  0-10-kernel-readiness-verification-suite: done
  ${storyKey}: review
course_correction:
  cc-2026-02-18:
    status: approved
`,
      },
      workingTreeFiles: {
        '_bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml': `project_lane: connectshyft
development_status:
  0-10-kernel-readiness-verification-suite: done
  ${storyKey}: done
course_correction:
  cc-2026-02-18:
    status: approved
`,
      },
    });

    const hasGuardFailure = /Status transition guard failed: sprint-status key '1-2-tenant-and-module-entitlement-administration' changed without matching story Status: update\./.test(
      output,
    );

    expect(status !== 0 && hasGuardFailure).toBe(true);
  });

  test('[P1] rejects coupled edits when story and sprint target statuses differ @P1', async ({ story15Context }) => {
    const storyKey = '1-2-tenant-and-module-entitlement-administration';
    const { output, status } = runPolicyScriptInTempRepo(story15Context.policyScript, story15Context.policyFile, {
      branch: 'codex/story-1-2-connectshyft-tenant-and-module-entitlement-administration',
      event: 'local',
      commitSubject: '1-2: mismatched coupled status edit',
      seedFiles: {
        [`_bmad-output/implementation-artifacts/${storyKey}.md`]: `# Story ${storyKey}

Status: review
`,
        '_bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml': `project_lane: connectshyft
development_status:
  0-10-kernel-readiness-verification-suite: done
  ${storyKey}: review
course_correction:
  cc-2026-02-18:
    status: approved
`,
      },
      workingTreeFiles: {
        [`_bmad-output/implementation-artifacts/${storyKey}.md`]: `# Story ${storyKey}

Status: done
`,
        '_bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml': `project_lane: connectshyft
development_status:
  0-10-kernel-readiness-verification-suite: done
  ${storyKey}: in-progress
course_correction:
  cc-2026-02-18:
    status: approved
`,
      },
    });

    const hasGuardFailure = /Status transition guard failed: story '1-2-tenant-and-module-entitlement-administration' updated to 'done' while sprint-status updated to 'in-progress'\./.test(
      output,
    );

    expect(status !== 0 && hasGuardFailure).toBe(true);
  });

  test('[P1] updates story and sprint status atomically for active lane story updates @P1', async () => {
    const storyKey = '1-2-tenant-and-module-entitlement-administration';
    const storyPath = `_bmad-output/implementation-artifacts/${storyKey}.md`;
    const connectStatusPath = '_bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml';

    const { output, status, files } = runStoryStatusTransitionInTempRepo('scripts/update-story-status.sh', {
      branch: 'codex/story-1-2-connectshyft-tenant-and-module-entitlement-administration',
      args: ['--story', storyKey, '--status', 'done'],
      seedFiles: {
        [storyPath]: `# Story ${storyKey}

Status: review
`,
        [connectStatusPath]: `project_lane: connectshyft
development_status:
  0-10-kernel-readiness-verification-suite: done
  ${storyKey}: review
course_correction:
  cc-2026-02-18:
    status: approved
`,
      },
      captureFiles: [storyPath, connectStatusPath],
    });

    expect(status).toBe(0);
    expect(/Status update succeeded/.test(output)).toBe(true);
    expect(/Status: done/.test(files[storyPath] ?? '')).toBe(true);
    expect(new RegExp(`${storyKey}: done`).test(files[connectStatusPath] ?? '')).toBe(true);
  });

  test('[P1] rejects invalid lifecycle transition and preserves both status sources @P1', async () => {
    const storyKey = '1-2-tenant-and-module-entitlement-administration';
    const storyPath = `_bmad-output/implementation-artifacts/${storyKey}.md`;
    const connectStatusPath = '_bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml';
    const originalStory = `# Story ${storyKey}

Status: ready-for-dev
`;
    const originalSprint = `project_lane: connectshyft
development_status:
  0-10-kernel-readiness-verification-suite: done
  ${storyKey}: ready-for-dev
course_correction:
  cc-2026-02-18:
    status: approved
`;

    const { output, status, files } = runStoryStatusTransitionInTempRepo('scripts/update-story-status.sh', {
      branch: 'codex/story-1-2-connectshyft-tenant-and-module-entitlement-administration',
      args: ['--story', storyKey, '--status', 'done'],
      seedFiles: {
        [storyPath]: originalStory,
        [connectStatusPath]: originalSprint,
      },
      captureFiles: [storyPath, connectStatusPath],
    });

    expect(status !== 0).toBe(true);
    expect(/invalid transition 'ready-for-dev' -> 'done'/.test(output)).toBe(true);
    expect(files[storyPath]).toBe(originalStory);
    expect(files[connectStatusPath]).toBe(originalSprint);
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
