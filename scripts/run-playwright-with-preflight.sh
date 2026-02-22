#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3001}"
BASE_URL="${BASE_URL:-http://localhost:5174}"
AUTO_START_STACK="${AUTO_START_STACK:-true}"
RUNTIME_DIR="${RUNTIME_DIR:-tests/artifacts/runtime}"
BACKEND_LOG_FILE="${RUNTIME_DIR}/backend.log"
FRONTEND_LOG_FILE="${RUNTIME_DIR}/frontend.log"
BACKEND_PID_FILE="${RUNTIME_DIR}/managed-backend.pid"
FRONTEND_PID_FILE="${RUNTIME_DIR}/managed-frontend.pid"
TEST_ENV="${TEST_ENV:-local}"
TEST_EMAIL="${TEST_EMAIL:-operator@example.com}"
TEST_PASSWORD="${TEST_PASSWORD:-SecurePass123!}"
ENABLE_TEST_AUTH_HARNESS="${ENABLE_TEST_AUTH_HARNESS:-true}"
ENABLE_TEST_CONNECTSHYFT_FLAGS="${ENABLE_TEST_CONNECTSHYFT_FLAGS:-true}"

export API_URL
export API_BASE_URL="$API_URL"
export BASE_URL
export FRONTEND_URL="${FRONTEND_URL:-$BASE_URL}"
export VITE_API_PROXY_TARGET="${VITE_API_PROXY_TARGET:-$API_URL}"
export TEST_ENV
export TEST_EMAIL
export TEST_PASSWORD
export ENABLE_TEST_AUTH_HARNESS
export ENABLE_TEST_CONNECTSHYFT_FLAGS

mkdir -p "$RUNTIME_DIR"
: > "$BACKEND_LOG_FILE"
: > "$FRONTEND_LOG_FILE"

BACKEND_PID=""
FRONTEND_PID=""
BACKEND_STARTED=false
FRONTEND_STARTED=false

validate_allowed_host() {
  local url="$1"
  local label="$2"
  local allowed_hosts="$3"

  local host
  host="$(node -e "const u = new URL(process.argv[1]); process.stdout.write(u.hostname);" "$url")"
  if [[ ! ",$allowed_hosts," == *",$host,"* ]]; then
    echo "Playwright preflight failed: $label must use one of [$allowed_hosts] (got: $url)"
    exit 1
  fi
}

find_available_port() {
  local start_port="$1"
  node -e "
const net = require('net');
const startPort = Number(process.argv[1]);
const maxPort = startPort + 50;
const tryPort = (port) => {
  if (port > maxPort) {
    process.exit(1);
  }
  const server = net.createServer();
  server.once('error', () => tryPort(port + 1));
  server.once('listening', () => server.close(() => process.stdout.write(String(port))));
  server.listen(port, '127.0.0.1');
};
tryPort(startPort);
" "$start_port"
}

wait_for_http() {
  local url="$1"
  local label="$2"
  local attempts="${3:-90}"

  for ((i = 1; i <= attempts; i++)); do
    if curl --silent --show-error --fail --max-time 2 "$url" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done

  echo "Playwright preflight failed: $label is not reachable at $url"
  return 1
}

is_http_reachable() {
  local url="$1"
  curl --silent --show-error --fail --max-time 2 "$url" >/dev/null 2>&1
}

is_backend_healthy() {
  is_http_reachable "$api_root/health" || is_http_reachable "$api_root/api/v1/health"
}

is_frontend_reachable() {
  is_http_reachable "$frontend_root/login" || is_http_reachable "$frontend_root"
}

build_tenant_probe_token() {
  node -e "
const fs = require('fs');
const path = require('path');

const backendEnvPath = path.resolve(process.cwd(), 'src/.env');
let jwtSecret = 'your_jwt_secret_change_in_production';
if (fs.existsSync(backendEnvPath)) {
  for (const rawLine of fs.readFileSync(backendEnvPath, 'utf8').split('\n')) {
    const line = rawLine.trim();
    if (line.startsWith('JWT_SECRET=')) {
      jwtSecret = line.slice('JWT_SECRET='.length).trim();
      break;
    }
  }
}

let jwt;
try {
  jwt = require(path.resolve(process.cwd(), 'src/node_modules/jsonwebtoken'));
} catch {
  process.exit(1);
}

const payload = {
  userId: 'preflight-probe-user',
  email: 'preflight-probe@example.com',
  householdId: 'preflight-probe-tenant',
  activeTenantId: 'preflight-probe-tenant',
  activeOrgUnitId: null,
  role: 'TENANT_STAFF',
};

process.stdout.write(jwt.sign(payload, jwtSecret, { expiresIn: '2h' }));
"
}

is_backend_tenant_contract_ready() {
  local token
  token="$(build_tenant_probe_token)" || return 1

  local csrf_token
  csrf_token="probe-csrf-$(date +%s)"

  local response_file
  response_file="$(mktemp)"

  local status
  status="$(curl --silent --show-error --max-time 4 \
    --output "$response_file" \
    --write-out "%{http_code}" \
    -H "x-csrf-token: $csrf_token" \
    -H "cookie: access_token=$token; csrf_token=$csrf_token" \
    "$api_root/api/v1/platform/_kernel/tenancy/diagnostics" || true)"

  local ready=false
  if [[ "$status" == "200" ]] && grep -q "TENANCY_DIAGNOSTICS_READY" "$response_file"; then
    ready=true
  fi

  rm -f "$response_file"
  [[ "$ready" == "true" ]]
}

is_test_auth_ready() {
  local status
  status="$(curl --silent --show-error --max-time 4 \
    --output /dev/null \
    --write-out "%{http_code}" \
    -H "content-type: application/json" \
    --data "{\"email\":\"$TEST_EMAIL\",\"password\":\"$TEST_PASSWORD\"}" \
    "$api_root/api/v1/auth/login" || true)"
  [[ "$status" == "200" ]]
}

is_backend_ready_for_tests() {
  is_backend_tenant_contract_ready && is_test_auth_ready
}

update_api_url_from_port() {
  local new_port="$1"
  API_URL="$(node -e "const u = new URL(process.argv[1]); u.hostname = 'localhost'; u.port = process.argv[2]; process.stdout.write(u.toString().replace(/\/$/, ''));" "$API_URL" "$new_port")"
  export API_URL
  export API_BASE_URL="$API_URL"
  export VITE_API_PROXY_TARGET="$API_URL"
  api_root="${API_URL%/}"
  backend_host="localhost"
  backend_port="$new_port"
}

update_base_url_from_port() {
  local new_port="$1"
  BASE_URL="$(node -e "const u = new URL(process.argv[1]); u.hostname = 'localhost'; u.port = process.argv[2]; process.stdout.write(u.toString().replace(/\/$/, ''));" "$BASE_URL" "$new_port")"
  export BASE_URL
  export FRONTEND_URL="$BASE_URL"
  frontend_root="${BASE_URL%/}"
  frontend_host="localhost"
  frontend_port="$new_port"
}

cleanup_pidfile_process() {
  local pid_file="$1"
  local label="$2"

  if [[ ! -f "$pid_file" ]]; then
    return 0
  fi

  local pid
  pid="$(cat "$pid_file" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    rm -f "$pid_file"
    return 0
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    echo "Cleaning stale managed $label process (pid=$pid)"
    kill "$pid" >/dev/null 2>&1 || true
  fi
  rm -f "$pid_file"
}

print_runtime_logs() {
  echo "==== Backend log tail ===="
  if [[ -f "$BACKEND_LOG_FILE" ]]; then
    tail -n 120 "$BACKEND_LOG_FILE" || true
  else
    echo "No backend log found"
  fi

  echo "==== Frontend log tail ===="
  if [[ -f "$FRONTEND_LOG_FILE" ]]; then
    tail -n 120 "$FRONTEND_LOG_FILE" || true
  else
    echo "No frontend log found"
  fi
}

cleanup_started_processes() {
  if [[ "$FRONTEND_STARTED" == "true" && -n "$FRONTEND_PID" ]]; then
    kill "$FRONTEND_PID" >/dev/null 2>&1 || true
    wait "$FRONTEND_PID" >/dev/null 2>&1 || true
    rm -f "$FRONTEND_PID_FILE"
  fi
  if [[ "$BACKEND_STARTED" == "true" && -n "$BACKEND_PID" ]]; then
    kill "$BACKEND_PID" >/dev/null 2>&1 || true
    wait "$BACKEND_PID" >/dev/null 2>&1 || true
    rm -f "$BACKEND_PID_FILE"
  fi
}

on_exit() {
  local exit_code=$?
  cleanup_started_processes
  if [[ "$exit_code" -ne 0 ]]; then
    print_runtime_logs
  fi
}
trap on_exit EXIT

validate_allowed_host "$API_URL" "API_URL" "localhost,127.0.0.1"
validate_allowed_host "$BASE_URL" "BASE_URL" "localhost,127.0.0.1"

api_root="${API_URL%/}"
frontend_root="${BASE_URL%/}"
backend_host="$(node -e "const u = new URL(process.argv[1]); process.stdout.write(u.hostname);" "$API_URL")"
backend_port="$(node -e "const u = new URL(process.argv[1]); process.stdout.write(u.port || '3001');" "$API_URL")"
frontend_host="$(node -e "const u = new URL(process.argv[1]); process.stdout.write(u.hostname);" "$BASE_URL")"
frontend_port="$(node -e "const u = new URL(process.argv[1]); process.stdout.write(u.port || '5174');" "$BASE_URL")"

if [[ ! -x "src/node_modules/.bin/ts-node-dev" ]]; then
  echo "Playwright preflight failed: backend dependencies are missing. Run 'npm install --prefix src' and retry."
  exit 1
fi

if [[ ! -x "frontend/node_modules/.bin/vite" ]]; then
  echo "Playwright preflight failed: frontend dependencies are missing. Run 'npm install --prefix frontend' and retry."
  exit 1
fi

backend_requires_managed_start=false
if is_backend_healthy; then
  if ! is_backend_ready_for_tests; then
    backend_requires_managed_start=true
    if [[ "$AUTO_START_STACK" != "true" ]]; then
      echo "Playwright preflight failed: backend at $API_URL is reachable but does not satisfy test runtime contracts and AUTO_START_STACK=false"
      exit 1
    fi
    local_backend_port="$(find_available_port "$backend_port" || true)"
    if [[ -z "${local_backend_port:-}" ]]; then
      echo "Playwright preflight failed: unable to find an available managed backend port near $backend_port."
      exit 1
    fi
    if [[ "$local_backend_port" == "$backend_port" ]]; then
      echo "Playwright preflight failed: backend at $API_URL is incompatible and no alternate port was found."
      exit 1
    fi
    echo "Managed runtime policy: existing backend at $API_URL is incompatible; switching to managed backend on port $local_backend_port"
    update_api_url_from_port "$local_backend_port"
  fi
else
  backend_requires_managed_start=true
fi

if [[ "$backend_requires_managed_start" == "true" ]]; then
  if [[ "$AUTO_START_STACK" != "true" ]]; then
    echo "Playwright preflight failed: backend is not reachable and AUTO_START_STACK=false"
    exit 1
  fi

  cleanup_pidfile_process "$BACKEND_PID_FILE" "backend"

  echo "Managed runtime policy: running backend migrations"
  if ! (cd src && npm run migrate:latest) >>"$BACKEND_LOG_FILE" 2>&1; then
    echo "Playwright preflight failed: backend migrations failed (see $BACKEND_LOG_FILE)."
    exit 1
  fi

  echo "Managed runtime policy: starting backend for this test run at $API_URL"
  (cd src && HOST="$backend_host" PORT="$backend_port" FRONTEND_URL="$BASE_URL" TEST_ENV="$TEST_ENV" TEST_EMAIL="$TEST_EMAIL" TEST_PASSWORD="$TEST_PASSWORD" ENABLE_TEST_AUTH_HARNESS="$ENABLE_TEST_AUTH_HARNESS" ENABLE_TEST_CONNECTSHYFT_FLAGS="$ENABLE_TEST_CONNECTSHYFT_FLAGS" npm run dev) >>"$BACKEND_LOG_FILE" 2>&1 &
  BACKEND_PID=$!
  BACKEND_STARTED=true
  echo "$BACKEND_PID" > "$BACKEND_PID_FILE"

  wait_for_http "$api_root/health" "backend health endpoint" || wait_for_http "$api_root/api/v1/health" "backend API health endpoint"

  if ! is_backend_ready_for_tests; then
    echo "Playwright preflight failed: managed backend did not satisfy test runtime contracts."
    exit 1
  fi
fi

frontend_requires_managed_start=false
if ! is_frontend_reachable; then
  frontend_requires_managed_start=true
fi

if [[ "$BACKEND_STARTED" == "true" ]]; then
  frontend_requires_managed_start=true
fi

if [[ "$frontend_requires_managed_start" == "true" ]]; then
  if [[ "$AUTO_START_STACK" != "true" ]]; then
    echo "Playwright preflight failed: frontend is not reachable and AUTO_START_STACK=false"
    exit 1
  fi

  cleanup_pidfile_process "$FRONTEND_PID_FILE" "frontend"

  if is_frontend_reachable; then
    local_frontend_port="$(find_available_port "$frontend_port" || true)"
    if [[ -z "${local_frontend_port:-}" ]]; then
      echo "Playwright preflight failed: unable to find an available managed frontend port near $frontend_port."
      exit 1
    fi
    if [[ "$local_frontend_port" == "$frontend_port" ]]; then
      echo "Playwright preflight failed: frontend at $BASE_URL is occupied and no alternate port was found."
      exit 1
    fi
    echo "Managed runtime policy: existing frontend at $BASE_URL is occupied; switching to managed frontend on port $local_frontend_port"
    update_base_url_from_port "$local_frontend_port"
  fi

  echo "Managed runtime policy: starting frontend for this test run at $BASE_URL"
  (cd frontend && VITE_API_PROXY_TARGET="$API_URL" VITE_ENABLE_TEST_CONNECTSHYFT_FLAGS="$ENABLE_TEST_CONNECTSHYFT_FLAGS" npm run dev -- --host "$frontend_host" --port "$frontend_port" --strictPort) >"$FRONTEND_LOG_FILE" 2>&1 &
  FRONTEND_PID=$!
  FRONTEND_STARTED=true
  echo "$FRONTEND_PID" > "$FRONTEND_PID_FILE"

  wait_for_http "$frontend_root/login" "frontend login page" || wait_for_http "$frontend_root" "frontend root page"
fi

npx playwright test "$@"
