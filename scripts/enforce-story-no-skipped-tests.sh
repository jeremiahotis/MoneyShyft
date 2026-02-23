#!/usr/bin/env bash
set -euo pipefail

story_id="${1:-}"

if [[ -z "$story_id" ]]; then
  echo "No story id provided; skipped-test guard skipped."
  exit 0
fi

if [[ ! -d tests/api/platform && ! -d tests/e2e/platform ]]; then
  echo "Skipped-test guard skipped: no platform test directories found."
  exit 0
fi

declare -a search_roots=()
if [[ -d tests/api/platform ]]; then
  search_roots+=("tests/api/platform")
fi
if [[ -d tests/e2e/platform ]]; then
  search_roots+=("tests/e2e/platform")
fi

story_specs=()
if command -v rg >/dev/null 2>&1; then
  while IFS= read -r spec_path; do
    if [[ -n "$spec_path" ]]; then
      story_specs+=("$spec_path")
    fi
  done < <(
    rg --files "${search_roots[@]}" \
      | rg "/${story_id}-.*\\.spec\\.ts$" \
      || true
  )
else
  while IFS= read -r spec_path; do
    if [[ -n "$spec_path" ]]; then
      story_specs+=("$spec_path")
    fi
  done < <(
    find "${search_roots[@]}" -type f -name "${story_id}-*.spec.ts" | sort \
      || true
  )
fi

if [[ ${#story_specs[@]} -eq 0 ]]; then
  echo "Skipped-test guard warning: no story-scoped platform specs found for ${story_id}."
  exit 0
fi

if command -v rg >/dev/null 2>&1; then
  violations="$(rg -n "(test|describe)\\.(skip|fixme)\\(" "${story_specs[@]}" || true)"
else
  violations="$(grep -nE "(test|describe)\\.(skip|fixme)\\(" "${story_specs[@]}" || true)"
fi

if [[ -n "${violations:-}" ]]; then
  echo "Policy check failed: skipped/fixme tests are not allowed for story ${story_id}."
  echo "Violations:"
  echo "$violations"
  exit 1
fi

echo "Skipped-test guard passed for story ${story_id}."
