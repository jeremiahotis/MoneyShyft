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
  local branch_story_id=""
  local branch_epic_token=""
  local branch_story_slug=""

  if [[ "$branch" =~ ^codex/story-(([0-9]+|[A-Za-z])-[0-9]+)-(.+)$ ]]; then
    branch_story_id="${BASH_REMATCH[1]}"
    branch_epic_token="${BASH_REMATCH[2]}"
    branch_story_slug="${BASH_REMATCH[3]}"
    if [[ "$branch_epic_token" =~ ^[A-Za-z]$ ]]; then
      story_id="$(echo "$branch_story_id" | tr '[:upper:]' '[:lower:]')"
    else
      story_id="$branch_story_id"
    fi
    story_slug="$branch_story_slug"
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
lane_context_args=(--format shell --branch "$branch")
if [[ -n "${PROJECT_LANE:-}" ]]; then
  lane_context_args+=(--lane "$PROJECT_LANE")
fi
if ! lane_context="$(node scripts/project-lane-context.js "${lane_context_args[@]}")"; then
  echo "Policy check failed: unable to resolve project lane context"
  exit 1
fi
eval "$lane_context"
lane_sprint_status_file="${SPRINT_STATUS_FILE:-$LANE_SPRINT_STATUS_FILE}"
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
subject_source="HEAD"
story_branch_id=""
if [[ "$branch" =~ ^codex/story-(([0-9]+|[A-Za-z])-[0-9]+)- ]]; then
  story_branch_id="${BASH_REMATCH[1]}"
  story_branch_epic_token="${BASH_REMATCH[2]}"
  if [[ "$story_branch_epic_token" =~ ^[A-Za-z]$ ]]; then
    story_branch_id="$(echo "$story_branch_id" | tr '[:upper:]' '[:lower:]')"
  fi
fi

# GitHub pull_request runs on a synthetic merge commit. Validate commit-subject policy
# against PR head commit subject (HEAD^2) when possible to avoid merge-subject bypass.
if [[ "$event" == "pull_request" ]] && [[ "$last_subject" == Merge* ]]; then
  pr_head_subject="$(git log -1 --pretty=%s HEAD^2 2>/dev/null || true)"
  if [[ -n "$pr_head_subject" ]]; then
    last_subject="$pr_head_subject"
    subject_source="HEAD^2"
  fi
fi

enforce_corrected_kernel_gate_for_story() {
  local story_id="$1"
  local epic_id="${story_id%%-*}"
  local status_file="$lane_sprint_status_file"
  local workflow_hint="dev-story"

  if [[ "$event" == "pull_request" ]]; then
    workflow_hint="code-review"
  fi

  if [[ "$epic_id" =~ ^[0-9]+$ ]]; then
    if [[ "$epic_id" == "0" ]]; then
      return 0
    fi
  else
    # Alpha epic IDs (e.g., a-1) belong to non-kernel lanes and are not gated by epic-0 readiness.
    return 0
  fi

  if [[ ! -f "$status_file" ]]; then
    echo "Policy check failed: missing $status_file required for corrected kernel gate enforcement"
    print_policy_context
    print_recovery "$workflow_hint"
    exit 1
  fi

  if ! grep -Eq '0-10-kernel-readiness-verification-suite:\s*done' "$status_file"; then
    echo "Policy check failed: corrected kernel gate unmet (Story 0-10 is not done)"
    echo "Feature story progression is blocked until corrected kernel acceptance criteria complete."
    print_policy_context
    echo "Required status gate: 0-10-kernel-readiness-verification-suite: done"
    print_recovery "$workflow_hint"
    exit 1
  fi

  if ! awk '
    /cc-2026-02-18:/ { in_block=1; next }
    in_block && /^[^[:space:]]/ { in_block=0 }
    in_block && /status:[[:space:]]*approved/ { ok=1 }
    END { exit ok ? 0 : 1 }
  ' "$status_file"; then
    echo "Policy check failed: corrected kernel gate unmet (course correction cc-2026-02-18 is not approved)"
    print_policy_context
    echo "Required status gate: course_correction.cc-2026-02-18.status: approved"
    print_recovery "$workflow_hint"
    exit 1
  fi
}

if [[ -n "$story_branch_id" ]]; then
  if [[ "$branch" =~ ^codex/story-${story_branch_id}-(.+)$ ]]; then
    story_branch_slug="${BASH_REMATCH[1]}"
    if [[ "-$story_branch_slug-" != *-"$LANE_SLUG_TOKEN"-* ]]; then
      echo "Policy check failed: story branch slug must include project lane token '$LANE_SLUG_TOKEN'"
      echo "Expected branch pattern: codex/story-${story_branch_id}-${LANE_SLUG_TOKEN}-<slug>"
      echo "Current branch: $branch"
      echo "Resolved project lane: $ACTIVE_LANE"
      print_policy_context
      print_recovery "dev-story"
      exit 1
    fi
  fi

  enforce_corrected_kernel_gate_for_story "$story_branch_id"
fi

if [[ -n "$last_subject" ]]; then
  if [[ "$is_default_branch" != "true" ]]; then
    if [[ "$event" != "pull_request" ]] && [[ "$last_subject" == Merge* ]]; then
      # Local/push mode preserves existing merge-subject exemption.
      true
    else
      if [[ ! "$last_subject" =~ ^(([0-9]+|[A-Za-z])-[0-9]+):\ .+ ]]; then
        echo "Policy check failed: latest commit subject must match '<story-id>: <summary>'"
        echo "Actual ($subject_source): $last_subject"
        exit 1
      fi

      commit_story_id="${BASH_REMATCH[1]}"
      if [[ "${BASH_REMATCH[2]}" =~ ^[A-Za-z]$ ]]; then
        commit_story_id="$(echo "$commit_story_id" | tr '[:upper:]' '[:lower:]')"
      fi

      if [[ -n "$story_branch_id" ]] && [[ "$commit_story_id" != "$story_branch_id" ]]; then
        echo "Policy check failed: latest commit subject must match '${story_branch_id}: <summary>' for branch $branch"
        echo "Actual ($subject_source): $last_subject"
        print_policy_context
        print_recovery "dev-story"
        exit 1
      fi
    fi
  fi
fi

bash scripts/enforce-envelope-helper-guard.sh
status_sync_args=(--status-file "$lane_sprint_status_file")
if [[ -n "$story_branch_id" && -n "${story_branch_slug:-}" ]]; then
  status_sync_key="${story_branch_id}-${story_branch_slug}"
  status_sync_story_file="_bmad-output/implementation-artifacts/${status_sync_key}.md"
  if [[ ! -f "$status_sync_story_file" ]] && [[ "$story_branch_slug" == "${LANE_SLUG_TOKEN}-"* ]]; then
    status_sync_key="${story_branch_id}-${story_branch_slug#${LANE_SLUG_TOKEN}-}"
  fi
  status_sync_args+=(--story-key "$status_sync_key")
fi
bash scripts/enforce-story-status-sync.sh "${status_sync_args[@]}"
node scripts/enforce-project-lane.js
bash scripts/enforce-operability-closeout-guard.sh

echo "Policy check passed"
