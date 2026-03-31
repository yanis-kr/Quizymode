#!/usr/bin/env bash
# _e2e-common.sh — shared E2E helper functions for Mac/Linux/WSL.
# Not meant to be run directly. Sourced by run-e2e-local-*.sh via:
#   . "$SCRIPT_DIR/_e2e-common.sh"
#
# Assumes Aspire (API + DB) is already running before the script is called.
# Start it with: cd src/Quizymode.Api.AppHost && dotnet run

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

# ---------------------------------------------------------------------------
# test_prerequisites
# ---------------------------------------------------------------------------
test_prerequisites() {
    local missing=()

    command -v dotnet >/dev/null 2>&1 || missing+=("dotnet (.NET SDK 10 required)")
    command -v node   >/dev/null 2>&1 || missing+=("node (Node.js 20.19+ or 22.12+ required)")
    command -v npx    >/dev/null 2>&1 || missing+=("npx (bundled with Node.js)")

    if [[ ${#missing[@]} -gt 0 ]]; then
        echo "Missing prerequisites:" >&2
        for item in "${missing[@]}"; do echo "  - $item" >&2; done
        exit 1
    fi

    # Default email if not set
    if [[ -z "${TEST_USER_EMAIL:-}" ]]; then
        export TEST_USER_EMAIL="test-user@quizymode.com"
        echo "Using default test email: $TEST_USER_EMAIL"
    fi

    # Prompt for password if not set
    if [[ -z "${TEST_USER_PASSWORD:-}" ]]; then
        read -rsp "Enter password for $TEST_USER_EMAIL: " TEST_USER_PASSWORD
        echo
        export TEST_USER_PASSWORD
        if [[ -z "$TEST_USER_PASSWORD" ]]; then
            echo "Password cannot be empty." >&2
            exit 1
        fi
    fi

    echo "Prerequisites OK."
}

# ---------------------------------------------------------------------------
# assert_api_is_up
# Checks that Aspire/API is already running using a TCP port test (avoids
# HTTPS certificate issues). Fails immediately if neither port responds.
# ---------------------------------------------------------------------------
assert_api_is_up() {
    echo "Checking API is up..."

    for port in 8082 8080; do
        if (echo >/dev/tcp/localhost/$port) 2>/dev/null; then
            echo "  API is up on port $port."
            return 0
        fi
    done

    echo "API is not reachable on ports 8080 or 8082. Start Aspire first:" >&2
    echo "  cd src/Quizymode.Api.AppHost && dotnet run" >&2
    exit 1
}

# ---------------------------------------------------------------------------
# start_react_dev_server
# Starts `npm run dev` if port 7000 is not already in use.
# Sets REACT_PID only when this script starts the process.
# ---------------------------------------------------------------------------
start_react_dev_server() {
    if (echo >/dev/tcp/localhost/7000) 2>/dev/null; then
        echo "React dev server already running on port 7000."
        REACT_PID=""
        return 0
    fi

    echo "Starting React dev server..."
    cd "$REPO_ROOT/src/Quizymode.Web"
    npm run dev &
    REACT_PID=$!
    cd "$REPO_ROOT"
}

# ---------------------------------------------------------------------------
# wait_for_react
# Polls http://localhost:7000 until it responds or timeout expires.
# ---------------------------------------------------------------------------
wait_for_react() {
    local timeout="${1:-60}"
    local url="http://localhost:7000"
    local start=$(date +%s)
    local deadline=$(( start + timeout ))

    echo "Waiting for React dev server at $url ..."
    while [[ $(date +%s) -lt $deadline ]]; do
        if curl -s --max-time 3 -o /dev/null -w "%{http_code}" "$url" 2>/dev/null \
           | grep -qE '^[23]'; then
            echo ""
            echo "  React dev server is up."
            return 0
        fi
        local elapsed=$(( $(date +%s) - start ))
        printf "\r  %ds elapsed..." "$elapsed"
        sleep 2
    done

    echo ""
    echo "React dev server did not start within ${timeout}s." >&2
    exit 1
}

# ---------------------------------------------------------------------------
# invoke_auth_setup
# Runs the Playwright auth-setup project.
# ---------------------------------------------------------------------------
invoke_auth_setup() {
    echo "Running Playwright auth setup..."
    cd "$REPO_ROOT"
    npx playwright test --project=auth-setup
    local rc=$?
    if [[ $rc -ne 0 ]]; then
        echo "Auth setup failed." >&2
        exit 1
    fi
    echo "Auth setup complete."
}

# ---------------------------------------------------------------------------
# stop_react_dev_server
# Kills the React dev server only if this script started it.
# If REACT_PID is empty (was already running), leaves it alone.
# ---------------------------------------------------------------------------
stop_react_dev_server() {
    if [[ -n "${REACT_PID:-}" ]] && kill -0 "$REACT_PID" 2>/dev/null; then
        kill "$REACT_PID" 2>/dev/null || true
        pkill -P "$REACT_PID" 2>/dev/null || true
        echo "React dev server stopped."
    fi
}

# ---------------------------------------------------------------------------
# remove_old_test_runs
# Deletes dated subfolders under playwright/test-results/ older than 7 days.
# ---------------------------------------------------------------------------
remove_old_test_runs() {
    local runs_dir="$REPO_ROOT/playwright/test-results"
    [[ -d "$runs_dir" ]] || return 0

    local deleted=0
    while IFS= read -r -d '' dir; do
        rm -rf "$dir"
        (( deleted++ )) || true
    done < <(find "$runs_dir" -mindepth 1 -maxdepth 1 -type d -mtime +7 -print0 2>/dev/null)

    if [[ $deleted -gt 0 ]]; then
        echo "Removed $deleted test-run folder(s) older than 7 days."
    fi
}

# ---------------------------------------------------------------------------
# show_test_summary
# Parses playwright-report/results.json, prints an AC-ID table, and opens
# the HTML report when a browser is available.
# ---------------------------------------------------------------------------
show_test_summary() {
    echo ""
    echo "══════════════════════════════════════════"
    echo " Test Summary"
    echo "══════════════════════════════════════════"

    local results_file="$REPO_ROOT/playwright-report/results.json"

    if [[ ! -f "$results_file" ]]; then
        echo "No results file found at $results_file"
    else
        node - "$results_file" <<'NODE_SCRIPT'
const fs   = require("fs");
const file = process.argv[2];
const json = JSON.parse(fs.readFileSync(file, "utf8"));

const acPattern = /AC\s+\d+(?:\.\d+)+/g;
const rows = [];

function collect(suite, prefix) {
  const title = prefix ? `${prefix} › ${suite.title}` : suite.title;
  for (const spec of (suite.specs || [])) {
    for (const test of (spec.tests || [])) {
      const fullTitle = `${title} › ${spec.title}`.replace(/^ › /, "");
      const status = test.status === "expected" ? "PASS"
                   : test.status === "unexpected" ? "FAIL"
                   : test.status === "flaky" ? "FLAKY"
                   : test.status.toUpperCase();
      const acMatches = [...fullTitle.matchAll(acPattern)].map(m => m[0]);
      rows.push({ status, ac: acMatches.join(", ") || "-", test: fullTitle });
    }
  }
  for (const child of (suite.suites || [])) collect(child, title);
}

for (const suite of (json.suites || [])) collect(suite, "");

const statusW = 6;
const acW     = Math.max(4, ...rows.map(r => r.ac.length));
const testW   = Math.max(4, ...rows.map(r => r.test.length));
const line    = (s, a, t) => s.padEnd(statusW) + "  " + a.padEnd(acW) + "  " + t;

console.log(line("Status", "AC", "Test"));
console.log("-".repeat(statusW + 2 + acW + 2 + testW));
for (const r of rows) console.log(line(r.status, r.ac, r.test));

const passed = rows.filter(r => r.status === "PASS").length;
const failed = rows.filter(r => r.status === "FAIL").length;
const flaky  = rows.filter(r => r.status === "FLAKY").length;
console.log(`\nPassed: ${passed}  Failed: ${failed}  Flaky: ${flaky}`);
NODE_SCRIPT
    fi

    local html_report="$REPO_ROOT/playwright-report/index.html"
    if [[ -f "$html_report" ]]; then
        echo "HTML report: $html_report"
        if command -v xdg-open >/dev/null 2>&1; then
            xdg-open "$html_report" 2>/dev/null &
        elif command -v open >/dev/null 2>&1; then
            open "$html_report" 2>/dev/null &
        fi
    fi
}
