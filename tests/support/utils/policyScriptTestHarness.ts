import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

type PolicyScriptHarnessOptions = {
  branch: string;
  event?: 'local' | 'pull_request' | 'push' | 'workflow_dispatch';
  headRef?: string;
  baseRef?: string;
  commitSubject?: string;
  prMergeSubject?: string;
  simulatePullRequestMergeCommit?: boolean;
  leaveWorktreeDirty?: boolean;
  seedFiles?: Record<string, string>;
  env?: Record<string, string>;
  workingTreeFiles?: Record<string, string>;
};

type PolicyScriptHarnessResult = {
  output: string;
  status: number;
};

function copyFileIfPresent(sourcePath: string, targetPath: string, executable = false): void {
  if (!existsSync(sourcePath)) {
    return;
  }
  const contents = readFileSync(sourcePath, 'utf8');
  mkdirSync(dirname(targetPath), { recursive: true });
  writeFileSync(targetPath, contents, 'utf8');
  if (executable) {
    chmodSync(targetPath, 0o755);
  }
}

function ensureProjectLaneMetadata(filePath: string, lane: string): void {
  if (!existsSync(filePath)) {
    return;
  }

  const laneLine = `project_lane: ${lane}`;
  const current = readFileSync(filePath, 'utf8');

  if (/^\s*project_lane\s*:/im.test(current)) {
    const updated = current.replace(/^\s*project_lane\s*:\s*[A-Za-z0-9_-]+\s*$/im, laneLine);
    writeFileSync(filePath, updated, 'utf8');
    return;
  }

  if (/^\s*project_key\s*:/im.test(current)) {
    const updated = current.replace(/^\s*project_key\s*:[^\n]*$/im, (line) => `${line}\n${laneLine}`);
    writeFileSync(filePath, updated, 'utf8');
    return;
  }

  writeFileSync(filePath, `${laneLine}\n${current}`, 'utf8');
}

function ensureStoryFilesForActiveStatuses(repoDir: string, sprintStatusPath: string): void {
  if (!existsSync(sprintStatusPath)) {
    return;
  }

  const raw = readFileSync(sprintStatusPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  let inDevelopmentStatus = false;

  for (const line of lines) {
    if (/^development_status:\s*$/.test(line)) {
      inDevelopmentStatus = true;
      continue;
    }

    if (inDevelopmentStatus && /^\S/.test(line)) {
      inDevelopmentStatus = false;
    }

    if (!inDevelopmentStatus) {
      continue;
    }

    const match = line.match(/^\s{2}([^:]+):\s*([A-Za-z0-9_-]+)\s*$/);
    if (!match) {
      continue;
    }

    const storyKey = match[1].trim();
    const status = match[2].trim().toLowerCase();
    if (!/^[0-9]+-[0-9]+-.+/.test(storyKey)) {
      continue;
    }
    if (!['ready-for-dev', 'in-progress', 'review', 'done'].includes(status)) {
      continue;
    }

    const storyPath = join(repoDir, '_bmad-output/implementation-artifacts', `${storyKey}.md`);
    if (existsSync(storyPath)) {
      continue;
    }
    mkdirSync(dirname(storyPath), { recursive: true });
    writeFileSync(
      storyPath,
      [
        `# Story ${storyKey}`,
        '',
        `Status: ${status}`,
        '',
        '### File List',
        '- `docs/policies/git_policy.md`',
        '',
        '### Debug Log References',
        '- `npm run policy:check` (pass)',
        '',
      ].join('\n'),
      'utf8',
    );
  }
}

export function runPolicyScriptInTempRepo(
  policyScriptPath: string,
  policyFilePath: string,
  options: PolicyScriptHarnessOptions,
): PolicyScriptHarnessResult {
  const repoDir = mkdtempSync(join(tmpdir(), 'policy-script-harness-'));
  const scriptAbsolutePath = resolve(policyScriptPath);
  const policyContents = readFileSync(resolve(policyFilePath), 'utf8');
  const branch = options.branch;
  const commitSubject = options.commitSubject ?? '0-9: policy harness seed';
  const baseBranch = options.baseRef ?? 'codex/dev';
  const scriptsDir = dirname(scriptAbsolutePath);
  const docsPoliciesDir = resolve(scriptsDir, '../docs/policies');

  try {
    mkdirSync(join(repoDir, 'docs/policies'), { recursive: true });
    writeFileSync(join(repoDir, 'docs/policies/git_policy.md'), policyContents);
    writeFileSync(join(repoDir, 'README.md'), '# policy harness\n');

    copyFileIfPresent(
      join(scriptsDir, 'enforce-envelope-helper-guard.sh'),
      join(repoDir, 'scripts/enforce-envelope-helper-guard.sh'),
      true,
    );
    copyFileIfPresent(
      join(scriptsDir, 'enforce-story-status-sync.sh'),
      join(repoDir, 'scripts/enforce-story-status-sync.sh'),
      true,
    );
    copyFileIfPresent(
      join(scriptsDir, 'enforce-status-transition-guard.sh'),
      join(repoDir, 'scripts/enforce-status-transition-guard.sh'),
      true,
    );
    copyFileIfPresent(
      join(scriptsDir, 'enforce-story-no-skipped-tests.sh'),
      join(repoDir, 'scripts/enforce-story-no-skipped-tests.sh'),
      true,
    );
    copyFileIfPresent(
      join(scriptsDir, 'enforce-story-artifact-hygiene.sh'),
      join(repoDir, 'scripts/enforce-story-artifact-hygiene.sh'),
      true,
    );
    copyFileIfPresent(
      join(scriptsDir, 'enforce-operability-closeout-guard.sh'),
      join(repoDir, 'scripts/enforce-operability-closeout-guard.sh'),
      true,
    );
    copyFileIfPresent(
      join(scriptsDir, 'enforce-project-lane.js'),
      join(repoDir, 'scripts/enforce-project-lane.js'),
    );
    copyFileIfPresent(
      join(scriptsDir, 'project-lane-context.js'),
      join(repoDir, 'scripts/project-lane-context.js'),
    );
    copyFileIfPresent(
      join(docsPoliciesDir, 'project_lanes.json'),
      join(repoDir, 'docs/policies/project_lanes.json'),
    );

    for (const [relativePath, contents] of Object.entries(options.seedFiles ?? {})) {
      const absolutePath = join(repoDir, relativePath);
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, contents);
    }

    const routeSprintStatusPath = join(repoDir, '_bmad-output/implementation-artifacts/sprint-status.yaml');
    const connectSprintStatusPath = join(repoDir, '_bmad-output/implementation-artifacts/sprint-status-connectshyft.yaml');

    if (!existsSync(routeSprintStatusPath)) {
      mkdirSync(dirname(routeSprintStatusPath), { recursive: true });
      writeFileSync(routeSprintStatusPath, 'development_status:\n', 'utf8');
    }
    if (!existsSync(connectSprintStatusPath)) {
      mkdirSync(dirname(connectSprintStatusPath), { recursive: true });
      writeFileSync(connectSprintStatusPath, 'development_status:\n', 'utf8');
    }

    ensureProjectLaneMetadata(routeSprintStatusPath, 'routeshyft');
    ensureProjectLaneMetadata(connectSprintStatusPath, 'connectshyft');
    ensureStoryFilesForActiveStatuses(repoDir, routeSprintStatusPath);
    ensureStoryFilesForActiveStatuses(repoDir, connectSprintStatusPath);

    execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'policy-harness@example.com'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Policy Harness'], { cwd: repoDir, stdio: 'ignore' });
    if (options.simulatePullRequestMergeCommit) {
      execFileSync('git', ['checkout', '-b', baseBranch], { cwd: repoDir, stdio: 'ignore' });
      execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', '0-0: policy harness base seed'], { cwd: repoDir, stdio: 'ignore' });

      execFileSync('git', ['checkout', '-b', branch], { cwd: repoDir, stdio: 'ignore' });
      writeFileSync(join(repoDir, 'STORY_HEAD.md'), '# story head commit\n');
      execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', commitSubject], { cwd: repoDir, stdio: 'ignore' });

      execFileSync('git', ['checkout', baseBranch], { cwd: repoDir, stdio: 'ignore' });
      writeFileSync(join(repoDir, 'BASE_HEAD.md'), '# base branch commit\n');
      execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', '0-0: policy harness base divergence'], { cwd: repoDir, stdio: 'ignore' });

      execFileSync('git', ['merge', '--no-ff', branch, '-m', options.prMergeSubject ?? `Merge pull request from ${branch}`], {
        cwd: repoDir,
        stdio: 'ignore',
      });
    } else {
      execFileSync('git', ['checkout', '-b', branch], { cwd: repoDir, stdio: 'ignore' });
      execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
      execFileSync('git', ['commit', '-m', commitSubject], { cwd: repoDir, stdio: 'ignore' });
    }

    if (options.leaveWorktreeDirty) {
      writeFileSync(join(repoDir, 'LOCAL_WORKTREE_DIRTY.md'), '# dirty worktree marker\n', 'utf8');
    }
    for (const [relativePath, contents] of Object.entries(options.workingTreeFiles ?? {})) {
      const absolutePath = join(repoDir, relativePath);
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, contents, 'utf8');
    }

    const env = {
      ...process.env,
      GITHUB_EVENT_NAME: options.event ?? 'local',
      ...(options.headRef ? { GITHUB_HEAD_REF: options.headRef } : {}),
      ...(options.baseRef ? { GITHUB_BASE_REF: options.baseRef } : {}),
      ...(options.env ?? {}),
    };

    try {
      const output = execFileSync('bash', [scriptAbsolutePath], {
        cwd: repoDir,
        env,
        encoding: 'utf8',
      });
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
