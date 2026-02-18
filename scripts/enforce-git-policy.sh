#!/usr/bin/env bash
set -euo pipefail

POLICY_FILE="docs/policies/git_policy.md"

print_local_recovery() {
  local story_id="0-9"
  local story_slug="ci-policy-gate-as-blocking-first-stage"
  local story_branch="codex/story-${story_id}-${story_slug}"
  echo "Policy reference: $POLICY_FILE"
  echo "Current branch: $branch"
  echo "Suggested story branch: $story_branch"
  echo "Remediation:"
  echo "  npm run start:story-branch -- $story_id $story_slug"
  echo "  npm run branch:ensure-workflow -- --workflow dev-story --story _bmad-output/implementation-artifacts/${story_id}-${story_slug}.md"
}

if [[ ! -f "$POLICY_FILE" ]]; then
  echo "Policy check failed: missing $POLICY_FILE"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Policy check failed: not inside a git repository"
  exit 1
fi

branch="${GITHUB_HEAD_REF:-}"
if [[ -z "$branch" ]]; then
  branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
fi
if [[ -z "$branch" ]]; then
  branch="${GITHUB_REF_NAME:-detached}"
fi

event="${GITHUB_EVENT_NAME:-local}"
base_branch="${GITHUB_BASE_REF:-}"
is_default_branch=false
if [[ "$branch" == "main" || "$branch" == "master" || "$branch" == "codex/dev" || "$branch" == "production" ]]; then
  is_default_branch=true
fi

if [[ "$event" == "pull_request" && ("$is_default_branch" == "true" || "$branch" == "detached") ]]; then
  echo "Policy check failed: pull requests must not run directly from $branch"
  exit 1
fi

if [[ "$event" == "local" && "$is_default_branch" == "true" ]]; then
  echo "Policy check failed: branch-first policy requires a non-default branch"
  print_local_recovery
  exit 1
fi

if [[ "$event" == "pull_request" ]]; then
  if [[ "$branch" =~ ^codex/story- ]] && [[ "$base_branch" != "codex/dev" ]]; then
    echo "Policy check failed: story pull requests must target codex/dev"
    echo "Head branch: $branch"
    echo "Base branch: ${base_branch:-<unset>}"
    exit 1
  fi
fi

last_subject="$(git log -1 --pretty=%s 2>/dev/null || true)"
if [[ -n "$last_subject" ]]; then
  if [[ "$last_subject" != Merge* ]] && [[ "$is_default_branch" != "true" ]]; then
    if [[ ! "$last_subject" =~ ^[0-9]+-[0-9]+:\ .+ ]]; then
      echo "Policy check failed: latest commit subject must match '<story-id>: <summary>'"
      echo "Actual: $last_subject"
      exit 1
    fi
  fi
fi

echo "Policy check passed"
