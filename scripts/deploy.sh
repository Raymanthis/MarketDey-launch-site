#!/usr/bin/env bash
# Deploy the committed HEAD to every Railway service that serves the site.
# Uploads a clean `git archive` (never the working tree), so uncommitted work never ships.
#
#   scripts/deploy.sh            deploy HEAD to all services
#   scripts/deploy.sh <ref>      deploy a specific commit/branch/tag
#
# Services and the domains they serve:
#   launch-site     www.marketdey.com, www.marketdey.com.ng
#   launch-site-ng  www.marketdey.ng
set -euo pipefail

PROJECT_ID="2f81d301-3f13-45c5-bb5f-716f97aad8c1" # Railway project: marketdey-launch-site
ENVIRONMENT="production"
SERVICES=(launch-site launch-site-ng)

REF="${1:-HEAD}"
ROOT="$(git rev-parse --show-toplevel)"
SHA="$(git -C "$ROOT" rev-parse --short "$REF")"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

git -C "$ROOT" archive "$REF" | tar -x -C "$TMP"
echo "Deploying $SHA to: ${SERVICES[*]}"

# Upload to all services in parallel; fail if any one fails.
pids=()
for svc in "${SERVICES[@]}"; do
  (cd "$TMP" && railway up --project "$PROJECT_ID" --environment "$ENVIRONMENT" --service "$svc" --ci -m "deploy $SHA" >"$TMP/$svc.log" 2>&1 \
    && echo "  ✓ $svc" || { echo "  ✗ $svc (log below)"; tail -30 "$TMP/$svc.log"; exit 1; }) &
  pids+=($!)
done
status=0
for pid in "${pids[@]}"; do wait "$pid" || status=1; done
exit $status
