#!/usr/bin/env bash
set -euo pipefail

if [[ $# -eq 0 ]]; then
  echo "Usage: bash scripts/ci-run-playwright-stack.sh <command> [args...]"
  exit 1
fi

runtime_dir="tests/artifacts/runtime"
mkdir -p "$runtime_dir"
backend_log="$runtime_dir/backend.log"
frontend_log="$runtime_dir/frontend.log"

: > "$backend_log"
: > "$frontend_log"

export TEST_ENV="${TEST_ENV:-local}"
export TEST_EMAIL="${TEST_EMAIL:-test@example.com}"
export TEST_PASSWORD="${TEST_PASSWORD:-test1234}"
export ENABLE_TEST_AUTH_HARNESS="${ENABLE_TEST_AUTH_HARNESS:-true}"
export ENABLE_TEST_CONNECTSHYFT_FLAGS="${ENABLE_TEST_CONNECTSHYFT_FLAGS:-true}"
export BASE_URL="${BASE_URL:-http://localhost:5174}"
export API_URL="${API_URL:-http://localhost:3000}"
export API_BASE_URL="${API_BASE_URL:-$API_URL}"
export FRONTEND_URL="${FRONTEND_URL:-http://localhost:5174}"
export VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-http://localhost:3000}"
export VITE_ENABLE_TEST_CONNECTSHYFT_FLAGS="${VITE_ENABLE_TEST_CONNECTSHYFT_FLAGS:-$ENABLE_TEST_CONNECTSHYFT_FLAGS}"
export HOST="${HOST:-localhost}"
export PORT="${PORT:-3000}"
frontend_host="$(node -e "const u = new URL(process.argv[1]); process.stdout.write(u.hostname);" "$BASE_URL")"
frontend_port="$(node -e "const u = new URL(process.argv[1]); process.stdout.write(u.port || '5174');" "$BASE_URL")"

print_runtime_logs() {
  echo "==== Backend log tail ===="
  if [[ -f "$backend_log" ]]; then
    tail -n 200 "$backend_log" || true
  else
    echo "No backend log found"
  fi
  echo "==== Frontend log tail ===="
  if [[ -f "$frontend_log" ]]; then
    tail -n 200 "$frontend_log" || true
  else
    echo "No frontend log found"
  fi
}

cleanup() {
  local exit_code=$?
  if [[ -n "${FRONTEND_PID:-}" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
  fi
  if [[ -n "${BACKEND_PID:-}" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
  fi

  if [[ "$exit_code" -ne 0 ]]; then
    print_runtime_logs
  fi
}
trap cleanup EXIT

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-90}"

  for ((i = 1; i <= attempts; i++)); do
    if curl --silent --show-error --fail --max-time 3 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Timed out waiting for $label at $url"
  return 1
}

echo "Ensuring pgcrypto extension is enabled"
node <<'NODE'
const path = require('node:path');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  process.exit(0);
}

const knexFactory = require(path.resolve(process.cwd(), 'src/node_modules/knex'));
const db = knexFactory({
  client: 'pg',
  connection: databaseUrl,
});

(async () => {
  await db.raw('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
})()
  .catch((error) => {
    console.error('Failed to ensure pgcrypto extension:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.destroy();
  });
NODE

echo "Running backend migrations"
npm run migrate:latest --prefix src

echo "Starting backend dev server"
(cd src && npm run dev) > "$backend_log" 2>&1 &
BACKEND_PID=$!

echo "Starting frontend dev server"
(cd frontend && npm run dev -- --host "$frontend_host" --port "$frontend_port") > "$frontend_log" 2>&1 &
FRONTEND_PID=$!

wait_for_http "${API_URL%/}/health" "backend health endpoint"
wait_for_http "${BASE_URL%/}/login" "frontend login page"

echo "Running test command: $*"
"$@"
