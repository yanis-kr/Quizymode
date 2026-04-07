#!/usr/bin/env bash
# generate-user-guides-production.sh
# Captures desktop and mobile user-guide screenshots from the live production site and regenerates
# docs/user-guide/user-guide.md and docs/user-guide/user-guide.mobile.md.
#
# No local servers required - screenshots are taken from https://www.quizymode.com
#
# Usage: ./scripts/generate-user-guides-production.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_e2e-common.sh"

exit_code=1

test_prerequisites

echo "Capturing desktop and mobile screenshots from production..."
cd "$REPO_ROOT"
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
