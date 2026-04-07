#!/usr/bin/env bash
# generate-user-guide-production.sh
# Captures desktop user-guide screenshots from the live production site and regenerates
# docs/user-guide/user-guide.md.
#
# No local servers required - screenshots are taken from https://www.quizymode.com
#
# Usage: ./scripts/generate-user-guide-production.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
. "$SCRIPT_DIR/_e2e-common.sh"

exit_code=1

test_prerequisites

echo "Capturing desktop screenshots from production..."
cd "$REPO_ROOT"
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
