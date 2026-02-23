import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

type StoryStatusHarnessOptions = {
  branch: string;
  args: string[];
  seedFiles?: Record<string, string>;
  captureFiles?: string[];
};

type StoryStatusHarnessResult = {
  output: string;
  status: number;
  files: Record<string, string>;
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

export function runStoryStatusTransitionInTempRepo(
  statusScriptPath: string,
  options: StoryStatusHarnessOptions,
): StoryStatusHarnessResult {
  const repoDir = mkdtempSync(join(tmpdir(), 'status-transition-harness-'));
  const scriptAbsolutePath = resolve(statusScriptPath);
  const scriptsDir = dirname(scriptAbsolutePath);
  const docsPoliciesDir = resolve(scriptsDir, '../docs/policies');

  try {
    copyFileIfPresent(scriptAbsolutePath, join(repoDir, 'scripts/update-story-status.sh'), true);
    copyFileIfPresent(
      join(scriptsDir, 'enforce-story-status-sync.sh'),
      join(repoDir, 'scripts/enforce-story-status-sync.sh'),
      true,
    );
    copyFileIfPresent(join(scriptsDir, 'project-lane-context.js'), join(repoDir, 'scripts/project-lane-context.js'));
    copyFileIfPresent(
      join(docsPoliciesDir, 'project_lanes.json'),
      join(repoDir, 'docs/policies/project_lanes.json'),
    );

    for (const [relativePath, contents] of Object.entries(options.seedFiles ?? {})) {
      const absolutePath = join(repoDir, relativePath);
      mkdirSync(dirname(absolutePath), { recursive: true });
      writeFileSync(absolutePath, contents, 'utf8');
    }

    execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'status-harness@example.com'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Status Harness'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', options.branch], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', '1-5: status harness seed'], { cwd: repoDir, stdio: 'ignore' });

    let output = '';
    let status = 0;
    try {
      output = execFileSync('bash', ['scripts/update-story-status.sh', ...options.args], {
        cwd: repoDir,
        env: {
          ...process.env,
          GITHUB_EVENT_NAME: 'local',
        },
        encoding: 'utf8',
      });
    } catch (error) {
      const typed = error as { status?: number; stdout?: string; stderr?: string };
      output = `${typed.stdout ?? ''}${typed.stderr ?? ''}`;
      status = typed.status ?? 1;
    }

    const files: Record<string, string> = {};
    for (const relativePath of options.captureFiles ?? []) {
      const absolutePath = join(repoDir, relativePath);
      if (!existsSync(absolutePath)) {
        continue;
      }
      files[relativePath] = readFileSync(absolutePath, 'utf8');
    }

    return { output, status, files };
  } finally {
    rmSync(repoDir, { recursive: true, force: true });
  }
}
