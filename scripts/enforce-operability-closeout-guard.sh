#!/usr/bin/env bash
set -euo pipefail

STORIES_DIR="_bmad-output/implementation-artifacts"

usage() {
  cat <<'EOF'
Usage: bash scripts/enforce-operability-closeout-guard.sh [options]

Options:
  --stories-dir <path>  Story markdown directory (default: _bmad-output/implementation-artifacts)
  -h, --help            Show this help message
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --stories-dir)
      STORIES_DIR="${2:-}"
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

if [[ ! -d "$STORIES_DIR" ]]; then
  echo "Operability closeout guard failed: missing stories directory: $STORIES_DIR"
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Operability closeout guard failed: not inside a git repository"
  exit 1
fi

TMP_DIR="$(mktemp -d)"
CHANGED_FILES_RAW="$TMP_DIR/changed_files.txt"
CHANGED_STORY_FILES="$TMP_DIR/changed_story_files.txt"

cleanup() {
  if [[ -n "${TMP_DIR:-}" && -d "${TMP_DIR:-}" ]]; then
    rm -rf "$TMP_DIR"
  fi
}
trap cleanup EXIT

add_changed_files() {
  local source_cmd="$1"
  eval "$source_cmd" >> "$CHANGED_FILES_RAW" || true
}

touch "$CHANGED_FILES_RAW"

add_changed_files "git diff --name-only --diff-filter=AM"
add_changed_files "git diff --cached --name-only --diff-filter=AM"
add_changed_files "git ls-files --others --exclude-standard"

if [[ -n "${GITHUB_BASE_REF:-}" ]] && git rev-parse --verify --quiet "origin/${GITHUB_BASE_REF}" >/dev/null; then
  add_changed_files "git diff --name-only --diff-filter=AM origin/${GITHUB_BASE_REF}...HEAD"
elif git rev-parse --verify --quiet HEAD~1 >/dev/null; then
  add_changed_files "git diff --name-only --diff-filter=AM HEAD~1...HEAD"
fi

sort -u "$CHANGED_FILES_RAW" | awk '
  /^_bmad-output\/implementation-artifacts\/([0-9]+|[A-Za-z])-[0-9]+-.*\.md$/ { print }
' > "$CHANGED_STORY_FILES"

if [[ ! -s "$CHANGED_STORY_FILES" ]]; then
  echo "Operability closeout guard passed (no changed story files)"
  exit 0
fi

trim() {
  local value="$1"
  # shellcheck disable=SC2001
  value="$(echo "$value" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
  echo "$value"
}

to_lower_trimmed() {
  local value="$1"
  value="$(trim "$value")"
  echo "$value" | tr '[:upper:]' '[:lower:]'
}

extract_field() {
  local file="$1"
  local field="$2"
  local line=""
  local prefix="- ${field}:"

  while IFS= read -r line; do
    local trimmed_line
    trimmed_line="$(trim "$line")"
    case "$trimmed_line" in
      "$prefix"*)
        trim "${trimmed_line#"$prefix"}"
        return 0
        ;;
    esac
  done < "$file"

  echo ""
}

extract_status() {
  local file="$1"
  awk '
    /^Status:[[:space:]]*/ {
      gsub(/\r$/, "", $0)
      print tolower($2)
      exit
    }
  ' "$file"
}

contains_access_control_keywords() {
  local file="$1"
  local line=""
  while IFS= read -r line; do
    local lowered
    lowered="$(echo "$line" | tr '[:upper:]' '[:lower:]')"

    case "$(trim "$lowered")" in
      "- access-control story:"*|"- role-admin ui path:"*|"- role-admin ui path verified:"*|"- access-control exemption rationale:"*)
        continue
        ;;
    esac

    if [[ "$lowered" =~ (^|[^a-z])(rbac|access[[:space:]-]?control|permissions?|role[[:space:]-]based|role[[:space:]-]admin|system[[:space:]]admin|tenant[[:space:]]admin|orgunit[[:space:]]admin)($|[^a-z]) ]]; then
      return 0
    fi
  done < "$file"

  return 1
}

is_blank_or_na() {
  local value
  value="$(to_lower_trimmed "$1")"
  [[ -z "$value" || "$value" == "n/a" || "$value" == "na" || "$value" == "none" || "$value" == "not-applicable" ]]
}

failures=0

while IFS= read -r story_file; do
  [[ -n "$story_file" ]] || continue
  [[ -f "$story_file" ]] || continue

  status="$(extract_status "$story_file")"
  if [[ "$status" != "done" ]]; then
    continue
  fi

  classification_reviewed="$(to_lower_trimmed "$(extract_field "$story_file" "Guardrail Classification Reviewed")")"
  critical_capability="$(to_lower_trimmed "$(extract_field "$story_file" "Critical Capability")")"
  access_control_story="$(to_lower_trimmed "$(extract_field "$story_file" "Access-Control Story")")"
  backend_operability="$(to_lower_trimmed "$(extract_field "$story_file" "Backend/API Implies Human Operability")")"
  usability_criteria_included="$(to_lower_trimmed "$(extract_field "$story_file" "Frontend/Operator Usability Criteria Included")")"
  real_user_evidence="$(extract_field "$story_file" "Real-User Validation Evidence")"
  real_user_result="$(to_lower_trimmed "$(extract_field "$story_file" "Real-User Validation Result")")"
  role_admin_path="$(extract_field "$story_file" "Role-Admin UI Path")"
  role_admin_verified="$(to_lower_trimmed "$(extract_field "$story_file" "Role-Admin UI Path Verified")")"
  access_control_exemption="$(extract_field "$story_file" "Access-Control Exemption Rationale")"

  if [[ "$classification_reviewed" != "yes" ]]; then
    echo "Operability closeout mismatch: $story_file is done but 'Guardrail Classification Reviewed' is not 'yes'."
    failures=$((failures + 1))
    continue
  fi

  if [[ "$critical_capability" == "yes" ]]; then
    if is_blank_or_na "$real_user_evidence"; then
      echo "Operability closeout mismatch: $story_file is critical capability but missing real-user validation evidence."
      failures=$((failures + 1))
    fi
    if [[ "$real_user_result" != "pass" ]]; then
      echo "Operability closeout mismatch: $story_file is critical capability but 'Real-User Validation Result' is not 'pass'."
      failures=$((failures + 1))
    fi
  fi

  if [[ "$backend_operability" == "yes" && "$usability_criteria_included" != "yes" ]]; then
    echo "Operability closeout mismatch: $story_file marks backend/API human operability but does not confirm frontend/operator usability criteria."
    failures=$((failures + 1))
  fi

  inferred_access_control=false
  if contains_access_control_keywords "$story_file"; then
    inferred_access_control=true
  fi

  if [[ "$access_control_story" == "yes" ]]; then
    if is_blank_or_na "$role_admin_path"; then
      echo "Operability closeout mismatch: $story_file is an access-control story but 'Role-Admin UI Path' is missing."
      failures=$((failures + 1))
    fi
    if [[ "$role_admin_verified" != "yes" ]]; then
      echo "Operability closeout mismatch: $story_file is an access-control story but 'Role-Admin UI Path Verified' is not 'yes'."
      failures=$((failures + 1))
    fi
  elif [[ "$inferred_access_control" == "true" ]]; then
    if is_blank_or_na "$access_control_exemption"; then
      echo "Operability closeout mismatch: $story_file appears to be access-control related but is not classified as such and has no exemption rationale."
      failures=$((failures + 1))
    fi
  fi
done < "$CHANGED_STORY_FILES"

if [[ $failures -gt 0 ]]; then
  echo "Operability closeout guard failed with $failures mismatch(es)."
  exit 1
fi

echo "Operability closeout guard passed"
