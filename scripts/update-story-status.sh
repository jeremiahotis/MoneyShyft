#!/usr/bin/env bash
set -euo pipefail

STATUS_FILE=""
STORIES_DIR="_bmad-output/implementation-artifacts"
STORY_KEY=""
STORY_FILE=""
TARGET_STATUS=""
FORCE_TRANSITION="false"

usage() {
  cat <<'USAGE'
Usage: bash scripts/update-story-status.sh --story <story-key> --status <status> [options]

Options:
  --story <key>         Story key (example: 1-2-tenant-and-module-entitlement-administration)
  --status <status>     Target status (backlog|ready-for-dev|in-progress|review|done)
  --story-file <path>   Explicit story file path (default: <stories-dir>/<story>.md)
  --stories-dir <path>  Story directory root (default: _bmad-output/implementation-artifacts)
  --status-file <path>  Sprint status yaml (default: resolved from scripts/project-lane-context.js)
  --force               Allow transition outside standard lifecycle rules
  -h, --help            Show this help message
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --story)
      STORY_KEY="${2:-}"
      shift 2
      ;;
    --status)
      TARGET_STATUS="${2:-}"
      shift 2
      ;;
    --story-file)
      STORY_FILE="${2:-}"
      shift 2
      ;;
    --stories-dir)
      STORIES_DIR="${2:-}"
      shift 2
      ;;
    --status-file)
      STATUS_FILE="${2:-}"
      shift 2
      ;;
    --force)
      FORCE_TRANSITION="true"
      shift
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

if [[ -z "$STORY_KEY" ]]; then
  echo "Status update failed: --story is required"
  exit 1
fi

if [[ -z "$TARGET_STATUS" ]]; then
  echo "Status update failed: --status is required"
  exit 1
fi

TARGET_STATUS="$(echo "$TARGET_STATUS" | tr '[:upper:]' '[:lower:]')"
if [[ ! "$TARGET_STATUS" =~ ^(backlog|ready-for-dev|in-progress|review|done)$ ]]; then
  echo "Status update failed: unsupported status '$TARGET_STATUS'"
  exit 1
fi

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

  local lane_context
  lane_context="$(node scripts/project-lane-context.js "${lane_context_args[@]}")"
  eval "$lane_context"

  if [[ -n "${SPRINT_STATUS_FILE:-}" ]]; then
    echo "$SPRINT_STATUS_FILE"
    return 0
  fi

  echo "${LANE_SPRINT_STATUS_FILE:-}"
}

if [[ -z "$STATUS_FILE" ]]; then
  STATUS_FILE="$(resolve_status_file_from_lane_context || true)"
fi
if [[ -z "$STATUS_FILE" ]]; then
  STATUS_FILE="_bmad-output/implementation-artifacts/sprint-status.yaml"
fi

if [[ -z "$STORY_FILE" ]]; then
  STORY_FILE="$STORIES_DIR/$STORY_KEY.md"
fi

if [[ ! -f "$STATUS_FILE" ]]; then
  echo "Status update failed: missing sprint status file: $STATUS_FILE"
  exit 1
fi

if [[ ! -f "$STORY_FILE" ]]; then
  echo "Status update failed: missing story file: $STORY_FILE"
  exit 1
fi

read_story_status() {
  local file_path="$1"
  awk '
    /^Status:[[:space:]]*/ {
      gsub(/\r$/, "", $0)
      print tolower($2)
      exit
    }
  ' "$file_path"
}

read_sprint_status() {
  local status_file="$1"
  local key="$2"
  awk -v key="$key" '
    BEGIN { in_dev=0 }
    /^development_status:[[:space:]]*$/ { in_dev=1; next }
    in_dev && /^[^[:space:]]/ { in_dev=0 }
    in_dev {
      line=$0
      sub(/^[[:space:]]+/, "", line)
      current_key=line
      sub(/:.*/, "", current_key)
      if (current_key == key) {
        value=line
        sub(/^[^:]+:[[:space:]]*/, "", value)
        print tolower(value)
        exit
      }
    }
  ' "$status_file"
}

is_transition_allowed() {
  local from="$1"
  local to="$2"

  if [[ "$from" == "$to" ]]; then
    return 0
  fi

  case "$from" in
    backlog)
      [[ "$to" == "ready-for-dev" ]]
      ;;
    ready-for-dev)
      [[ "$to" == "in-progress" ]]
      ;;
    in-progress)
      [[ "$to" == "review" ]]
      ;;
    review)
      [[ "$to" == "in-progress" || "$to" == "done" ]]
      ;;
    done)
      [[ "$to" == "review" ]]
      ;;
    *)
      return 1
      ;;
  esac
}

current_story_status="$(read_story_status "$STORY_FILE")"
if [[ -z "$current_story_status" ]]; then
  echo "Status update failed: missing 'Status:' line in $STORY_FILE"
  exit 1
fi

current_sprint_status="$(read_sprint_status "$STATUS_FILE" "$STORY_KEY")"
if [[ -z "$current_sprint_status" ]]; then
  echo "Status update failed: sprint-status missing key '$STORY_KEY' in $STATUS_FILE"
  exit 1
fi

if [[ "$current_story_status" != "$current_sprint_status" ]]; then
  echo "Status update failed: current status drift detected for '$STORY_KEY' (story='$current_story_status', sprint='$current_sprint_status')"
  exit 1
fi

if [[ "$FORCE_TRANSITION" != "true" ]] && ! is_transition_allowed "$current_story_status" "$TARGET_STATUS"; then
  echo "Status update failed: invalid transition '$current_story_status' -> '$TARGET_STATUS' for '$STORY_KEY'"
  echo "Use --force to override transition rules when explicitly required."
  exit 1
fi

if [[ "$current_story_status" == "$TARGET_STATUS" ]]; then
  echo "Status update no-op: '$STORY_KEY' already at '$TARGET_STATUS'"
  exit 0
fi

tmp_dir="$(mktemp -d)"
story_tmp="$tmp_dir/story.md"
status_tmp="$tmp_dir/sprint-status.yaml"
story_backup="$tmp_dir/story.backup.md"
status_backup="$tmp_dir/sprint-status.backup.yaml"

cleanup() {
  if [[ -d "$tmp_dir" ]]; then
    rm -rf "$tmp_dir"
  fi
}
trap cleanup EXIT

awk -v target="$TARGET_STATUS" '
  BEGIN { replaced=0 }
  {
    if (!replaced && $0 ~ /^Status:[[:space:]]*/) {
      print "Status: " target
      replaced=1
      next
    }
    print $0
  }
  END {
    if (!replaced) {
      exit 1
    }
  }
' "$STORY_FILE" > "$story_tmp" || {
  echo "Status update failed: unable to render story status update for $STORY_FILE"
  exit 1
}

awk -v key="$STORY_KEY" -v target="$TARGET_STATUS" '
  BEGIN { in_dev=0; replaced=0 }
  /^development_status:[[:space:]]*$/ { in_dev=1; print; next }
  in_dev && /^[^[:space:]]/ { in_dev=0 }
  {
    if (in_dev) {
      line=$0
      sub(/^[[:space:]]+/, "", line)
      current_key=line
      sub(/:.*/, "", current_key)
      if (!replaced && current_key == key) {
        indent=""
        if (match($0, /^[[:space:]]+/)) {
          indent=substr($0, RSTART, RLENGTH)
        }
        printf("%s%s: %s\n", indent, key, target)
        replaced=1
        next
      }
    }
    print $0
  }
  END {
    if (!replaced) {
      exit 1
    }
  }
' "$STATUS_FILE" > "$status_tmp" || {
  echo "Status update failed: unable to render sprint status update for '$STORY_KEY'"
  exit 1
}

cp "$STORY_FILE" "$story_backup"
cp "$STATUS_FILE" "$status_backup"

if ! mv "$story_tmp" "$STORY_FILE"; then
  echo "Status update failed: could not update story file"
  exit 1
fi

if ! mv "$status_tmp" "$STATUS_FILE"; then
  cp "$story_backup" "$STORY_FILE"
  echo "Status update failed: could not update sprint status file"
  exit 1
fi

if ! bash scripts/enforce-story-status-sync.sh --status-file "$STATUS_FILE" --stories-dir "$(dirname "$STORY_FILE")" --story-key "$STORY_KEY" >/dev/null; then
  cp "$story_backup" "$STORY_FILE"
  cp "$status_backup" "$STATUS_FILE"
  echo "Status update failed: post-update sync verification failed; changes rolled back"
  exit 1
fi

echo "Status update succeeded: '$STORY_KEY' $current_story_status -> $TARGET_STATUS"
