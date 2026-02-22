#!/usr/bin/env bash
set -euo pipefail

workflow=""
story_input=""
epic_input=""
lane_override=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workflow)
      if [[ $# -lt 2 || -z "${2-}" || "${2-}" == --* ]]; then
        echo "Missing value for --workflow"
        exit 1
      fi
      workflow="$2"
      shift 2
      ;;
    --story)
      if [[ $# -lt 2 || -z "${2-}" || "${2-}" == --* ]]; then
        echo "Missing value for --story"
        exit 1
      fi
      story_input="$2"
      shift 2
      ;;
    --epic)
      if [[ $# -lt 2 || -z "${2-}" || "${2-}" == --* ]]; then
        echo "Missing value for --epic"
        exit 1
      fi
      epic_input="$2"
      shift 2
      ;;
    --lane)
      if [[ $# -lt 2 || -z "${2-}" || "${2-}" == --* ]]; then
        echo "Missing value for --lane"
        exit 1
      fi
      lane_override="$2"
      shift 2
      ;;
    *)
      echo "Unknown argument: $1"
      exit 1
      ;;
  esac
done

if [[ -z "$workflow" ]]; then
  echo "Missing required argument: --workflow"
  exit 1
fi

normalize_workflow_key() {
  local raw="$1"
  local lower
  local base
  local dir

  lower="$(echo "$raw" | tr '[:upper:]' '[:lower:]')"

  # Common short aliases should continue working directly.
  case "$lower" in
    at|ta|ds|cr|ci|nr|rv|tf|tr|tmt|automate|atdd|create-story|dev-story|code-review|sprint-planning|retrospective|correct-course)
      echo "$lower"
      return 0
      ;;
  esac

  base="$(basename "$lower")"

  # If caller passed a workflow file path, use the parent folder as the key.
  if [[ "$base" =~ ^workflow\.(yaml|yml|md|xml)$ ]]; then
    dir="$(basename "$(dirname "$lower")")"
    echo "$dir"
    return 0
  fi

  # Otherwise strip known extensions and use filename.
  base="${base%.yaml}"
  base="${base%.yml}"
  base="${base%.md}"
  base="${base%.xml}"

  echo "$base"
}

workflow_key="$(normalize_workflow_key "$workflow")"

resolve_branch() {
  local event="${GITHUB_EVENT_NAME:-local}"
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

branch="$(resolve_branch)"

lane_context_args=(--format shell --branch "$branch")
if [[ -n "$lane_override" ]]; then
  lane_context_args+=(--lane "$lane_override")
fi
if ! lane_context="$(node scripts/project-lane-context.js "${lane_context_args[@]}")"; then
  exit 1
fi
eval "$lane_context"

story_workflow_regex='^(atdd|automate|create-story|dev-story|code-review|at|ta|ds|cr)$'
epic_workflow_regex='^(sprint-planning|retrospective|correct-course)$'
phase0_status_file="${PHASE0_READINESS_STATUS_FILE:-_bmad-output/implementation-artifacts/phase0-readiness.json}"
readiness_api_spec="${PHASE0_READINESS_API_SPEC:-tests/api/platform/kernel-readiness-verification-suite.api.spec.ts}"
sprint_status_file="${SPRINT_STATUS_FILE:-$LANE_SPRINT_STATUS_FILE}"

normalize_story_id() {
  local raw="$1"
  raw="$(basename "$raw")"
  if [[ "$raw" =~ ^(([0-9]+|[A-Za-z])[.-]([0-9]+)) ]]; then
    local epic_token="${BASH_REMATCH[2]}"
    local story_number="${BASH_REMATCH[3]}"
    if [[ "$epic_token" =~ ^[A-Za-z]$ ]]; then
      epic_token="$(echo "$epic_token" | tr '[:upper:]' '[:lower:]')"
    fi
    echo "${epic_token}-${story_number}"
    return 0
  fi
  echo ""
}

ensure_corrected_kernel_gate() {
  local story_id="$1"
  local epic_id="${story_id%%-*}"

  if [[ "$epic_id" =~ ^[0-9]+$ ]]; then
    if [[ "$epic_id" == "0" ]]; then
      return 0
    fi
  else
    # Alpha epic IDs (e.g., a-1) belong to non-kernel lanes and are not gated by epic-0 readiness.
    return 0
  fi

  if [[ ! -f "$sprint_status_file" ]]; then
    echo "Kernel gate failed: missing $sprint_status_file"
    exit 1
  fi

  if ! grep -Eq '0-10-kernel-readiness-verification-suite:\s*done' "$sprint_status_file"; then
    echo "Kernel gate failed: Story 0-10 is not done. Feature story workflows are blocked until corrected kernel acceptance criteria are complete."
    exit 1
  fi

  if ! awk '
    /cc-2026-02-18:/ { in_block=1; next }
    in_block && /^[^[:space:]]/ { in_block=0 }
    in_block && /status:[[:space:]]*approved/ { ok=1 }
    END { exit ok ? 0 : 1 }
  ' "$sprint_status_file"; then
    echo "Kernel gate failed: course correction cc-2026-02-18 is not approved in sprint status."
    exit 1
  fi
}

is_phase0_readiness_complete() {
  local file_path="$1"

  if [[ ! -f "$file_path" ]]; then
    return 1
  fi

  node -e '
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const filePath = process.argv[1];
const repoRoot = process.cwd();
const requiredGates = [
  "tenancy",
  "auth",
  "csrf",
  "envelope",
  "eventOutbox",
  "timezone",
  "rbac",
  "activeTenantMembership",
  "globalEmailUniqueness",
];
const allowedRoots = [
  path.resolve(path.join(repoRoot, "_bmad-output/implementation-artifacts")),
  path.resolve(path.join(repoRoot, "tests/artifacts/gates")),
];

const isIsoDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));
const isInsideAllowedRoot = (targetPath) =>
  allowedRoots.some((root) => targetPath === root || targetPath.startsWith(`${root}${path.sep}`));
const resolveAllowedPath = (candidatePath) => {
  if (typeof candidatePath !== "string" || candidatePath.trim() === "") {
    return null;
  }
  const resolved = path.resolve(path.isAbsolute(candidatePath) ? candidatePath : path.join(repoRoot, candidatePath));
  if (!isInsideAllowedRoot(resolved)) {
    return null;
  }
  return resolved;
};

const hasCanonicalRequiredGates = (value) =>
  Array.isArray(value)
  && value.length === requiredGates.length
  && requiredGates.every((gate, index) => value[index] === gate);

const hasCanonicalGateResultMap = (value) => {
  if (!value || typeof value !== "object") {
    return false;
  }

  const keys = Object.keys(value);
  if (keys.length !== requiredGates.length) {
    return false;
  }

  for (const gate of requiredGates) {
    if (value[gate] !== "pass") {
      return false;
    }
  }

  return keys.every((key) => requiredGates.includes(key));
};

try {
  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!payload || payload.phase0Status !== "complete" || payload.storyId !== "0-10") {
    process.exit(1);
  }

  if (!isIsoDate(payload.recordedAt)) {
    process.exit(1);
  }

  if (typeof payload.readinessReportHash !== "string" || !/^[a-f0-9]{64}$/i.test(payload.readinessReportHash)) {
    process.exit(1);
  }

  if (!hasCanonicalRequiredGates(payload.requiredGates)) {
    process.exit(1);
  }

  if (!hasCanonicalGateResultMap(payload.gateResults)) {
    process.exit(1);
  }

  const readinessReportPath = resolveAllowedPath(payload.readinessReportPath);
  if (!readinessReportPath || !fs.existsSync(readinessReportPath)) {
    process.exit(1);
  }

  const reportRaw = fs.readFileSync(readinessReportPath, "utf8");
  const reportHash = crypto.createHash("sha256").update(reportRaw, "utf8").digest("hex");
  if (reportHash !== payload.readinessReportHash) {
    process.exit(1);
  }

  const report = JSON.parse(reportRaw);
  const phase0Readiness = report?.phase0_readiness;
  if (
    report?.gate !== "epic-0-quality"
    || report?.pass !== true
    || !phase0Readiness
    || phase0Readiness.story_id !== "0-10"
    || phase0Readiness.all_passed !== true
    || !hasCanonicalRequiredGates(phase0Readiness.required_gates)
    || !hasCanonicalGateResultMap(phase0Readiness.gate_results)
    || !isIsoDate(report?.timestamp_utc)
  ) {
    process.exit(1);
  }

  process.exit(0);
} catch (_error) {
  // treated as incomplete
}
process.exit(1);
' "$file_path"
}

requires_phase0_readiness() {
  local normalized_story_id="$1"
  local epic_token="${normalized_story_id%%-*}"

  if [[ "$epic_token" == "0" ]]; then
    return 1
  fi

  if [[ "$epic_token" =~ ^[0-9]+$ ]]; then
    [[ "$epic_token" -gt 0 ]]
    return $?
  fi

  if [[ "$epic_token" =~ ^[A-Za-z]$ ]]; then
    return 1
  fi

  return 1
}

if [[ "$workflow_key" =~ $story_workflow_regex ]]; then
  if [[ -z "$story_input" ]]; then
    echo "Story workflow requires --story"
    exit 1
  fi

  story_id="$(normalize_story_id "$story_input")"
  if [[ -z "$story_id" ]]; then
    echo "Could not parse story id from: $story_input"
    exit 1
  fi

  ensure_corrected_kernel_gate "$story_id"

  if [[ ! "$branch" =~ ^codex/story-${story_id}-(.+)$ ]]; then
    echo "Branch guard failed"
    echo "Workflow key: $workflow_key"
    echo "Expected branch pattern: codex/story-${story_id}-${LANE_SLUG_TOKEN}-<slug>"
    echo "Current branch: $branch"
    echo "Resolved project lane: $ACTIVE_LANE"
    exit 1
  fi
  story_slug="${BASH_REMATCH[1]}"

  if [[ "-$story_slug-" != *-"$LANE_SLUG_TOKEN"-* ]]; then
    echo "Branch guard failed"
    echo "Workflow key: $workflow_key"
    echo "Expected branch pattern: codex/story-${story_id}-${LANE_SLUG_TOKEN}-<slug>"
    echo "Current branch: $branch"
    echo "Resolved project lane: $ACTIVE_LANE"
    exit 1
  fi

  if requires_phase0_readiness "$story_id"; then
    if ! is_phase0_readiness_complete "$phase0_status_file"; then
      echo "Phase-0 readiness incomplete"
      echo "Complete Story 0.10 kernel readiness verification suite first"
      echo "Readiness status file: $phase0_status_file"
      echo "Run: npm run test:e2e -- $readiness_api_spec"
      echo "Run: npm run branch:ensure-workflow -- --workflow $workflow --story $story_input"
      exit 1
    fi

    echo "Phase-0 readiness verified"
  fi

  echo "Branch guard passed for story workflow"
  exit 0
fi

if [[ "$workflow_key" =~ $epic_workflow_regex ]]; then
  if [[ -z "$epic_input" ]]; then
    echo "Epic workflow requires --epic"
    exit 1
  fi

  if [[ "$epic_input" =~ ^([0-9]+|[A-Za-z])$ ]]; then
    epic_token="${BASH_REMATCH[1]}"
    if [[ "$epic_token" =~ ^[A-Za-z]$ ]]; then
      epic_token="$(echo "$epic_token" | tr '[:upper:]' '[:lower:]')"
    fi
  else
    echo "Epic value must be numeric or a single letter. Actual: $epic_input"
    exit 1
  fi

  if [[ ! "$branch" =~ ^codex/epic-${epic_token}-ops$ ]]; then
    echo "Branch guard failed"
    echo "Workflow key: $workflow_key"
    echo "Expected branch: codex/epic-${epic_token}-ops"
    echo "Current branch: $branch"
    exit 1
  fi

  echo "Branch guard passed for epic workflow"
  exit 0
fi

echo "No branch rule for workflow '$workflow'; guard passed"
