#!/usr/bin/env bash
set -euo pipefail

STORIES_DIR="_bmad-output/implementation-artifacts"
STATUS_VALUE_REGEX='(backlog|ready-for-dev|in-progress|review|done)'

resolve_compare_range() {
  local event="${GITHUB_EVENT_NAME:-local}"
  local base_branch="${GITHUB_BASE_REF:-}"

  if [[ "$event" == "local" ]]; then
    if git rev-parse --verify --quiet HEAD >/dev/null; then
      echo "HEAD"
      return 0
    fi
  fi

  if [[ "$event" == "pull_request" && -n "$base_branch" ]]; then
    if git rev-parse --verify --quiet "origin/${base_branch}" >/dev/null; then
      echo "origin/${base_branch}...HEAD"
      return 0
    fi

    if git rev-parse --verify --quiet "${base_branch}" >/dev/null; then
      echo "${base_branch}...HEAD"
      return 0
    fi
  fi

  for candidate in origin/codex/dev codex/dev origin/main main origin/master master; do
    if git rev-parse --verify --quiet "$candidate" >/dev/null; then
      echo "${candidate}...HEAD"
      return 0
    fi
  done

  if git rev-parse --verify --quiet HEAD >/dev/null; then
    echo "HEAD"
    return 0
  fi

  return 1
}

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Status transition guard skipped: not in a git repository."
  exit 0
fi

compare_range="$(resolve_compare_range || true)"
if [[ -z "$compare_range" ]]; then
  echo "Status transition guard skipped: unable to resolve compare range."
  exit 0
fi

mapfile -t changed_story_files < <(git diff --name-only "$compare_range" -- "$STORIES_DIR"/[0-9]*-[0-9]*-*.md | sort -u)
mapfile -t changed_sprint_files < <(git diff --name-only "$compare_range" -- "$STORIES_DIR"/sprint-status*.yaml | sort -u)

declare -A changed_story_status_keys=()
declare -A changed_sprint_status_keys=()
declare -A story_added_status=()
declare -A sprint_added_status=()

for file in "${changed_story_files[@]}"; do
  [[ -n "$file" ]] || continue
  key="$(basename "$file" .md)"

  added_status="$(
    git diff --unified=0 --no-color "$compare_range" -- "$file" \
      | awk -v regex="$STATUS_VALUE_REGEX" '
          $0 ~ "^\\+Status:[[:space:]]*" regex "[[:space:]]*$" {
            line=$0
            sub(/^\+Status:[[:space:]]*/, "", line)
            gsub(/[[:space:]]+$/, "", line)
            print tolower(line)
            exit
          }
        '
  )"

  if [[ -n "$added_status" ]]; then
    changed_story_status_keys["$key"]="$file"
    story_added_status["$key"]="$added_status"
  fi
done

for file in "${changed_sprint_files[@]}"; do
  [[ -n "$file" ]] || continue

  while IFS=$'\t' read -r key status; do
    [[ -n "$key" && -n "$status" ]] || continue
    changed_sprint_status_keys["$key"]="$file"
    sprint_added_status["$key"]="$status"
  done < <(
    git diff --unified=0 --no-color "$compare_range" -- "$file" \
      | awk -v regex="$STATUS_VALUE_REGEX" '
          $0 ~ "^\\+[[:space:]]+[0-9]+-[0-9]+-.+:[[:space:]]*" regex "[[:space:]]*$" {
            line=$0
            sub(/^\+[[:space:]]+/, "", line)
            key=line
            sub(/:.*/, "", key)
            status=line
            sub(/^[^:]+:[[:space:]]*/, "", status)
            gsub(/[[:space:]]+$/, "", status)
            printf("%s\t%s\n", key, tolower(status))
          }
        '
  )
done

violations=0

for key in "${!changed_story_status_keys[@]}"; do
  if [[ -z "${changed_sprint_status_keys[$key]:-}" ]]; then
    echo "Status transition guard failed: story '$key' changed Status: without matching sprint-status development_status update."
    echo "  Story file: ${changed_story_status_keys[$key]}"
    echo "  Required path: npm run story:status:update -- --story $key --status <status>"
    violations=$((violations + 1))
  fi
done

for key in "${!changed_sprint_status_keys[@]}"; do
  if [[ -z "${changed_story_status_keys[$key]:-}" ]]; then
    echo "Status transition guard failed: sprint-status key '$key' changed without matching story Status: update."
    echo "  Sprint status file: ${changed_sprint_status_keys[$key]}"
    echo "  Required path: npm run story:status:update -- --story $key --status <status>"
    violations=$((violations + 1))
  fi
done

for key in "${!changed_story_status_keys[@]}"; do
  if [[ -z "${changed_sprint_status_keys[$key]:-}" ]]; then
    continue
  fi

  story_status="${story_added_status[$key]:-}"
  sprint_status="${sprint_added_status[$key]:-}"
  if [[ -n "$story_status" && -n "$sprint_status" && "$story_status" != "$sprint_status" ]]; then
    echo "Status transition guard failed: story '$key' updated to '$story_status' while sprint-status updated to '$sprint_status'."
    echo "  Story file: ${changed_story_status_keys[$key]}"
    echo "  Sprint status file: ${changed_sprint_status_keys[$key]}"
    echo "  Required path: npm run story:status:update -- --story $key --status <status>"
    violations=$((violations + 1))
  fi
done

if [[ $violations -gt 0 ]]; then
  echo "Status transition guard failed with $violations violation(s)."
  exit 1
fi

echo "Status transition guard passed"
