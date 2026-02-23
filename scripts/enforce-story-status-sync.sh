#!/usr/bin/env bash
set -euo pipefail

STATUS_FILE=""
STORIES_DIR="_bmad-output/implementation-artifacts"
STORY_KEY=""
TMP_DIR=""
SPRINT_MAP_FILE=""

usage() {
  cat <<'EOF'
Usage: bash scripts/enforce-story-status-sync.sh [options]

Options:
  --status-file <path>  Path to sprint status yaml (default: resolved from scripts/project-lane-context.js)
  --stories-dir <path>  Path to story markdown files (default: _bmad-output/implementation-artifacts)
  --story-key <key>     Validate only one story key (example: 1-2-... or a-1-...)
  -h, --help            Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --status-file)
      STATUS_FILE="${2:-}"
      shift 2
      ;;
    --stories-dir)
      STORIES_DIR="${2:-}"
      shift 2
      ;;
    --story-key)
      STORY_KEY="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1"
      usage
      exit 1
      ;;
  esac
done

resolve_status_file_from_lane_context() {
  local branch=""
  local lane_context_args=(--format shell)

  branch="$(git symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
  if [[ -z "$branch" || "$branch" == "HEAD" ]]; then
    branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || true)"
  fi
  if [[ -n "$branch" && "$branch" != "HEAD" ]]; then
    lane_context_args+=(--branch "$branch")
  fi
  if [[ -n "${PROJECT_LANE:-}" ]]; then
    lane_context_args+=(--lane "$PROJECT_LANE")
  fi

  local lane_context=""
  lane_context="$(node scripts/project-lane-context.js "${lane_context_args[@]}")"
  eval "$lane_context"

  if [[ -n "${SPRINT_STATUS_FILE:-}" ]]; then
    echo "$SPRINT_STATUS_FILE"
    return 0
  fi

  if [[ -n "${LANE_SPRINT_STATUS_FILE:-}" ]]; then
    echo "$LANE_SPRINT_STATUS_FILE"
    return 0
  fi

  echo ""
}

if [[ -z "$STATUS_FILE" ]]; then
  STATUS_FILE="$(resolve_status_file_from_lane_context || true)"
fi

if [[ -z "$STATUS_FILE" ]]; then
  STATUS_FILE="_bmad-output/implementation-artifacts/sprint-status.yaml"
fi

if [[ ! -f "$STATUS_FILE" ]]; then
  echo "Story status sync check failed: missing sprint status file: $STATUS_FILE"
  exit 1
fi

if [[ ! -d "$STORIES_DIR" ]]; then
  echo "Story status sync check failed: missing stories directory: $STORIES_DIR"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
SPRINT_MAP_FILE="$TMP_DIR/sprint_story_status.tsv"

cleanup() {
  if [[ -n "$TMP_DIR" && -d "$TMP_DIR" ]]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

while IFS=$'\t' read -r key value; do
  if [[ "$key" =~ ^([0-9]+|[A-Za-z])-[0-9]+-.+ && -n "$value" ]]; then
    printf '%s\t%s\n' "$key" "$value" >> "$SPRINT_MAP_FILE"
  fi
done < <(
  awk '
    BEGIN { in_dev=0 }
    /^development_status:/ { in_dev=1; next }
    in_dev && /^[^[:space:]]/ { in_dev=0 }
    in_dev && /^[[:space:]][[:space:]]/ {
      line=$0
      sub(/^[[:space:]][[:space:]]/, "", line)

      key=line
      sub(/:.*/, "", key)

      value=line
      sub(/^[^:]+:[[:space:]]*/, "", value)

      if (key != "" && value != "") {
        printf("%s\t%s\n", key, tolower(value))
      }
    }
  ' "$STATUS_FILE"
)

if [[ ! -s "$SPRINT_MAP_FILE" ]]; then
  echo "Story status sync check failed: no story entries found in development_status: $STATUS_FILE"
  exit 1
fi

declare -a target_story_files=()
if [[ -n "$STORY_KEY" ]]; then
  target_story_files+=("$STORIES_DIR/$STORY_KEY.md")
else
  for story_file in "$STORIES_DIR"/*.md; do
    [[ -e "$story_file" ]] || continue
    story_key_candidate="$(basename "$story_file" .md)"
    if [[ "$story_key_candidate" =~ ^([0-9]+|[A-Za-z])-[0-9]+-.+ ]]; then
      target_story_files+=("$story_file")
    fi
  done
fi

if [[ ${#target_story_files[@]} -eq 0 ]]; then
  echo "Story status sync check failed: no story files found in $STORIES_DIR"
  exit 1
fi

failures=0

sprint_status_for_key() {
  local key="$1"
  awk -F'\t' -v key="$key" '
    $1 == key {
      print $2
      found=1
      exit 0
    }
    END {
      if (!found) {
        exit 1
      }
    }
  ' "$SPRINT_MAP_FILE"
}

for story_file in "${target_story_files[@]}"; do
  if [[ ! -f "$story_file" ]]; then
    echo "Status sync mismatch: story file missing: $story_file"
    failures=$((failures + 1))
    continue
  fi

  story_key="$(basename "$story_file" .md)"
  story_status="$(
    awk '
      /^Status:[[:space:]]*/ {
        gsub(/\r$/, "", $0)
        print tolower($2)
        exit
      }
    ' "$story_file"
  )"

  if [[ -z "$story_status" ]]; then
    echo "Status sync mismatch: missing 'Status:' line in $story_file"
    failures=$((failures + 1))
    continue
  fi

  sprint_status="$(sprint_status_for_key "$story_key" || true)"
  if [[ -z "$sprint_status" ]]; then
    echo "Status sync mismatch: sprint-status missing key '$story_key' for $story_file"
    failures=$((failures + 1))
    continue
  fi

  if [[ "$story_status" != "$sprint_status" ]]; then
    echo "Status sync mismatch: $story_key story='$story_status' sprint='$sprint_status'"
    failures=$((failures + 1))
  fi
done

while IFS=$'\t' read -r sprint_key status; do
  if [[ -n "$STORY_KEY" && "$sprint_key" != "$STORY_KEY" ]]; then
    continue
  fi

  if [[ "$status" =~ ^(ready-for-dev|in-progress|review|done)$ ]]; then
    expected_story_file="$STORIES_DIR/$sprint_key.md"
    if [[ ! -f "$expected_story_file" ]]; then
      echo "Status sync mismatch: sprint-status has '$sprint_key: $status' but story file is missing: $expected_story_file"
      failures=$((failures + 1))
    fi
  fi
done < "$SPRINT_MAP_FILE"

if [[ $failures -gt 0 ]]; then
  echo "Story status sync check failed with $failures mismatch(es)."
  exit 1
fi

echo "Story status sync check passed"
