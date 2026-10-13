#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${HOME}/.go-server/logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/maintenance.log"
{
  echo "[$(date -Iseconds)] maintenance:start"
  cd "$ROOT" || exit 1
  if [ -x scripts/self-update.sh ]; then bash scripts/self-update.sh || echo "self-update failed"
  fi
  node scripts/backup.mjs || echo "auto-backup failed"
  node scripts/sync-repos.js || echo "repo sync failed"
  echo "[$(date -Iseconds)] maintenance:end"
} >> "$LOG_FILE" 2>&1
