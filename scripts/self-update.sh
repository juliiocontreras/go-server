#!/usr/bin/env bash
set -euo pipefail
cd "${GOSERVER_DIR:-$(pwd)}"
before=$(git rev-parse HEAD)
git fetch origin main
git reset --hard origin/main
after=$(git rev-parse HEAD)
if [ -f package-lock.json ]; then npm ci --omit=dev; fi
if [ "$before" != "$after" ]; then
  if command -v pm2 >/dev/null 2>&1; then pm2 restart go-server || true; fi
  echo "updated:$before->$after"
else
  echo "already-current:$after"
fi
