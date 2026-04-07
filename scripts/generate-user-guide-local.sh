#!/usr/bin/env bash
# generate-user-guide-local.sh
# Captures desktop user-guide screenshots from the local dev stack and regenerates
# docs/user-guide/user-guide.md.
#
# Prerequisites: start Aspire first in a separate terminal:
#   cd src/Quizymode.Api.AppHost && dotnet run
#
# Usage: ./scripts/generate-user-guide-local.sh

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

echo "Capturing desktop screenshots from local dev stack..."
mkdir -p "$REPO_ROOT/docs/user-guide/screenshots/user"
rm -f "$REPO_ROOT/docs/user-guide/screenshots/user"/*.png
npx playwright test --project=screenshots || echo "Desktop screenshot capture had failures. Proceeding to generate guide anyway."

echo "Generating desktop user guide..."
node scripts/generate-user-guide.js --guide desktop
exit_code=$?

guide_file="$REPO_ROOT/docs/user-guide/user-guide.md"
if [[ -f "$guide_file" ]]; then
    echo ""
    echo "Desktop user guide updated:"
    echo "  $guide_file"
fi

exit $exit_code
