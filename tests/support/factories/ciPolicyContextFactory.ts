export type CiPolicyContext = {
  workflowFile: string;
  policyScript: string;
  policyFile: string;
  branchGuardScript: string;
  protectedBranches: string[];
  downstreamJobs: string[];
  remediationHint: string;
};

export function createCiPolicyContext(overrides: Partial<CiPolicyContext> = {}): CiPolicyContext {
  return {
    workflowFile: '.github/workflows/test.yml',
    policyScript: 'scripts/enforce-git-policy.sh',
    policyFile: 'docs/policies/git_policy.md',
    branchGuardScript: 'scripts/branch-ensure-workflow.sh',
    protectedBranches: ['main', 'master', 'codex/dev', 'production'],
    downstreamJobs: ['lint', 'test', 'burn-in', 'quality-gates'],
    remediationHint: 'Create or switch to a matching story branch and rerun the workflow guard command.',
    ...overrides,
  };
}
