#!/usr/bin/env bash
# generate-user-guides-local.sh
# Captures desktop and mobile user-guide screenshots from the local dev stack and regenerates
# docs/user-guide/user-guide.md and docs/user-guide/user-guide.mobile.md.
#
# Prerequisites: start Aspire first in a separate terminal:
#   cd src/Quizymode.Api.AppHost && dotnet run
#
# Usage: ./scripts/generate-user-guides-local.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_e2e-common.sh"

cleanup() {
    stop_react_dev_server
}
trap cleanup EXIT INT TERM

exit_code=1

test_prerequisites
assert_api_is_up
start_react_dev_server
wait_for_react
invoke_auth_setup

export PLAYWRIGHT_BASE_URL="http://localhost:7000"
cd "$REPO_ROOT"

echo "Capturing desktop and mobile screenshots from local dev stack..."
mkdir -p "$REPO_ROOT/docs/user-guide/screenshots/user"
mkdir -p "$REPO_ROOT/docs/user-guide/screenshots/mobile"
rm -f "$REPO_ROOT/docs/user-guide/screenshots/user"/*.png
rm -f "$REPO_ROOT/docs/user-guide/screenshots/mobile"/*.png
npx playwright test --project=screenshots --project=screenshots-mobile || echo "Screenshot capture had failures. Proceeding to generate guides anyway."

echo "Generating desktop and mobile user guides..."
node scripts/generate-user-guide.js --all
exit_code=$?

for guide_file in \
    "$REPO_ROOT/docs/user-guide/user-guide.md" \
    "$REPO_ROOT/docs/user-guide/user-guide.mobile.md"; do
    if [[ -f "$guide_file" ]]; then
        echo ""
        echo "User guide updated:"
        echo "  $guide_file"
    fi
done

exit $exit_code
