#!/usr/bin/env bash
# run-e2e-local-full.sh
# Runs the full Playwright E2E suite against the local dev stack.
#
# Prerequisites: start Aspire first in a separate terminal:
#   cd src/Quizymode.Api.AppHost && dotnet run
#
# Usage: ./scripts/run-e2e-local-full.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_e2e-common.sh"

REACT_PID=""
exit_code=1

RUN_ID="full-$(date '+%Y-%m-%d_%H-%M-%S')"
OUTPUT_DIR="$REPO_ROOT/playwright/test-results/$RUN_ID"

cleanup() {
    stop_react_dev_server
}
trap cleanup EXIT INT TERM

test_prerequisites
assert_api_is_up
start_react_dev_server
wait_for_react
invoke_auth_setup

export PLAYWRIGHT_BASE_URL="http://localhost:7000"
cd "$REPO_ROOT"
npx playwright test --project=e2e-full --output="$OUTPUT_DIR"
exit_code=$?

show_test_summary

if [[ -d "$OUTPUT_DIR" ]]; then
    echo ""
    echo "Screenshots saved to:"
    echo "  $OUTPUT_DIR"
fi

remove_old_test_runs

exit $exit_code
