#!/usr/bin/env bash
set -euo pipefail

POLICY_FILE="docs/policies/git_policy.md"

print_policy_context() {
  echo "Policy reference: $POLICY_FILE"
  echo "Current branch: $branch"
}

print_recovery() {
  local workflow_hint="${1:-dev-story}"
  local story_id=""
  local story_slug=""

  if [[ "$branch" =~ ^codex/story-([0-9]+-[0-9]+)-(.+)$ ]]; then
    story_id="${BASH_REMATCH[1]}"
    story_slug="${BASH_REMATCH[2]}"
  fi

  echo "Remediation:"
  if [[ -n "$story_id" && -n "$story_slug" ]]; then
    echo "  npm run start:story-branch -- $story_id $story_slug"
    echo "  npm run branch:ensure-workflow -- --workflow $workflow_hint --story _bmad-output/implementation-artifacts/${story_id}-${story_slug}.md"
  else
    echo "  npm run start:story-branch -- <story-id> <story-slug>"
    echo "  npm run branch:ensure-workflow -- --workflow $workflow_hint --story <story-key-or-story-file>"
  fi
}

resolve_branch() {
  local resolved=""

  if [[ "$event" == "local" ]]; then
    # Local checks must trust repository state, not CI-provided branch env vars.
    resolved="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
    if [[ -z "$resolved" || "$resolved" == "HEAD" ]]; then
      resolved="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
    fi
  else
    resolved="${GITHUB_HEAD_REF:-}"
    if [[ -z "$resolved" ]]; then
      resolved="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
    fi
    if [[ -z "$resolved" || "$resolved" == "HEAD" ]]; then
      resolved="${GITHUB_REF_NAME:-}"
    fi
  fi

  if [[ -z "$resolved" || "$resolved" == "HEAD" ]]; then
    echo "detached"
    return 0
  fi

  echo "$resolved"
}

if [[ ! -f "$POLICY_FILE" ]]; then
  echo "Policy check failed: missing $POLICY_FILE"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Policy check failed: not inside a git repository"
  exit 1
fi

event="${GITHUB_EVENT_NAME:-local}"
branch="$(resolve_branch)"
base_branch="${GITHUB_BASE_REF:-}"
is_default_branch=false
if [[ "$branch" == "main" || "$branch" == "master" || "$branch" == "codex/dev" || "$branch" == "production" ]]; then
  is_default_branch=true
fi

if [[ "$event" == "pull_request" && ("$is_default_branch" == "true" || "$branch" == "detached") ]]; then
  echo "Policy check failed: pull requests must not run directly from $branch"
  echo "Base branch: ${base_branch:-<unset>}"
  print_policy_context
  print_recovery "code-review"
  exit 1
fi

if [[ "$event" == "local" && "$is_default_branch" == "true" ]]; then
  echo "Policy check failed: branch-first policy requires a non-default branch"
  print_policy_context
  print_recovery "dev-story"
  exit 1
fi

if [[ "$event" == "pull_request" ]]; then
  if [[ "$branch" =~ ^codex/story- ]] && [[ "$base_branch" != "codex/dev" ]]; then
    echo "Policy check failed: story pull requests must target codex/dev"
    echo "Head branch: $branch"
    echo "Base branch: ${base_branch:-<unset>}"
    print_policy_context
    print_recovery "code-review"
    exit 1
  fi
fi

last_subject="$(git log -1 --pretty=%s 2>/dev/null || true)"
story_branch_id=""
if [[ "$branch" =~ ^codex/story-([0-9]+-[0-9]+)- ]]; then
  story_branch_id="${BASH_REMATCH[1]}"
fi

if [[ -n "$last_subject" ]]; then
  if [[ "$last_subject" != Merge* ]] && [[ "$is_default_branch" != "true" ]]; then
    if [[ ! "$last_subject" =~ ^[0-9]+-[0-9]+:\ .+ ]]; then
      echo "Policy check failed: latest commit subject must match '<story-id>: <summary>'"
      echo "Actual: $last_subject"
      exit 1
    fi

    if [[ -n "$story_branch_id" ]] && [[ ! "$last_subject" =~ ^${story_branch_id}:\ .+ ]]; then
      echo "Policy check failed: latest commit subject must match '${story_branch_id}: <summary>' for branch $branch"
      echo "Actual: $last_subject"
      print_policy_context
      print_recovery "dev-story"
      exit 1
    fi
  fi
fi

echo "Policy check passed"
