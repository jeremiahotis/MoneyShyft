#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 [--allow-dirty] [--lane <lane-id>] <story-id> <slug>"
  echo "Example: $0 0-1 canonical-app-entrypoint-and-platform-middleware-chain"
  echo "Example: $0 a-1 connectshyft-feature-flag-and-availability-guardrails"
  echo "Example: $0 --lane connectshyft 1-1 admin-user-creation-ui"
  echo "Example: $0 --allow-dirty 0-1 canonical-app-entrypoint-and-platform-middleware-chain"
}

allow_dirty=false
lane_override=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --allow-dirty)
      allow_dirty=true
      shift
      ;;
    --lane)
      if [[ $# -lt 2 || -z "${2-}" || "${2-}" == --* ]]; then
        echo "Missing value for --lane"
        exit 1
      fi
      lane_override="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      break
      ;;
  esac
done

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

story_id="$1"
shift
slug_raw="$*"

if [[ "$story_id" =~ ^([0-9]+|[A-Za-z])-([0-9]+)$ ]]; then
  epic_token="${BASH_REMATCH[1]}"
  story_number="${BASH_REMATCH[2]}"
  if [[ "$epic_token" =~ ^[A-Za-z]$ ]]; then
    epic_token="$(echo "$epic_token" | tr '[:upper:]' '[:lower:]')"
  fi
  story_id="${epic_token}-${story_number}"
else
  echo "Invalid story id '$story_id'. Expected format: <epic>-<story> where <epic> is numeric or a letter (e.g. 0-1, a-1)"
  exit 1
fi

epic_id="${story_id%%-*}"
current_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"

lane_context_args=(--format shell --branch "${current_branch:-detached}")
if [[ -n "$lane_override" ]]; then
  lane_context_args+=(--lane "$lane_override")
fi
if ! lane_context="$(node scripts/project-lane-context.js "${lane_context_args[@]}")"; then
  exit 1
fi
eval "$lane_context"

status_file="${SPRINT_STATUS_FILE:-$LANE_SPRINT_STATUS_FILE}"

if [[ "$epic_id" =~ ^[0-9]+$ && "$epic_id" != "0" ]]; then
  if [[ ! -f "$status_file" ]]; then
    echo "Kernel gate failed: missing $status_file"
    exit 1
  fi

  if ! grep -Eq '0-10-kernel-readiness-verification-suite:\s*done' "$status_file"; then
    echo "Kernel gate failed: Story 0-10 is not done. Cannot start feature story branch $story_id yet."
    exit 1
  fi

  if ! awk '
    /cc-2026-02-18:/ { in_block=1; next }
    in_block && /^[^[:space:]]/ { in_block=0 }
    in_block && /status:[[:space:]]*approved/ { ok=1 }
    END { exit ok ? 0 : 1 }
  ' "$status_file"; then
    echo "Kernel gate failed: course correction cc-2026-02-18 is not approved."
    exit 1
  fi
fi

slug="$(echo "$slug_raw" \
  | tr '[:upper:]' '[:lower:]' \
  | sed -E 's/[^a-z0-9]+/-/g; s/^-+//; s/-+$//; s/-+/-/g')"

if [[ -z "$slug" ]]; then
  echo "Slug cannot be empty after normalization"
  exit 1
fi

if [[ "-$slug-" != *-"$LANE_SLUG_TOKEN"-* ]]; then
  slug="${LANE_SLUG_TOKEN}-${slug}"
fi

branch="codex/story-${story_id}-${slug}"

if [[ -n "$(git status --porcelain)" ]]; then
  if [[ "$allow_dirty" == "false" ]]; then
    echo "Working tree is not clean. Commit or stash changes before creating a new story branch."
    echo "Tip: pass --allow-dirty to create the story branch from current HEAD without checkout/pull."
    exit 1
  fi
fi

if git show-ref --verify --quiet "refs/heads/${branch}"; then
  echo "Branch already exists locally: ${branch}"
  echo "Checkout it directly: git checkout ${branch}"
  exit 1
fi

if [[ "$allow_dirty" == "true" ]]; then
  current_branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  if [[ -z "$current_branch" ]]; then
    echo "Cannot create branch from detached HEAD in --allow-dirty mode."
    exit 1
  fi
  if [[ "$current_branch" != "codex/dev" ]]; then
    echo "Warning: --allow-dirty is creating story branch from '${current_branch}', not codex/dev."
  fi
else
  git fetch origin codex/dev
  git checkout codex/dev
  git pull --ff-only origin codex/dev
fi

git checkout -b "$branch"
git config "branch.${branch}.gh-merge-base" "codex/dev"

echo "Created branch: $branch"
echo "PR base default set to: codex/dev"
