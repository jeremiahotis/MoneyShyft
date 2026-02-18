import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

type PolicyScriptHarnessOptions = {
  branch: string;
  event?: 'local' | 'pull_request' | 'push' | 'workflow_dispatch';
  headRef?: string;
  baseRef?: string;
  commitSubject?: string;
};

type PolicyScriptHarnessResult = {
  output: string;
  status: number;
};

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

  try {
    mkdirSync(join(repoDir, 'docs/policies'), { recursive: true });
    writeFileSync(join(repoDir, 'docs/policies/git_policy.md'), policyContents);
    writeFileSync(join(repoDir, 'README.md'), '# policy harness\n');

    execFileSync('git', ['init'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.email', 'policy-harness@example.com'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['config', 'user.name', 'Policy Harness'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['checkout', '-b', branch], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['add', '.'], { cwd: repoDir, stdio: 'ignore' });
    execFileSync('git', ['commit', '-m', commitSubject], { cwd: repoDir, stdio: 'ignore' });

    const env = {
      ...process.env,
      GITHUB_EVENT_NAME: options.event ?? 'local',
      ...(options.headRef ? { GITHUB_HEAD_REF: options.headRef } : {}),
      ...(options.baseRef ? { GITHUB_BASE_REF: options.baseRef } : {}),
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
