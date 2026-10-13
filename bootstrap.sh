#!/usr/bin/env bash
set -euo pipefail
REPO_URL="${GO_SERVER_REPO:-https://github.com/juliiocontreras/go-server.git}"
TARGET="${GO_SERVER_DIR:-$HOME/go-server}"

printf '\n🚀 Instalando Go Server...\n\n'
if [ -n "${PREFIX:-}" ] && [[ "$PREFIX" == *com.termux* ]]; then
  pkg update -y
  pkg install -y git nodejs-lts
elif ! command -v git >/dev/null 2>&1; then
  echo "❌ Git no está instalado. Instálalo y vuelve a ejecutar este comando."
  exit 1
fi

if [ -d "$TARGET/.git" ]; then
  echo "↻ Go Server ya existe. Actualizando..."
  git -C "$TARGET" fetch origin main
  git -C "$TARGET" reset --hard origin/main
else
  git clone "$REPO_URL" "$TARGET"
fi

exec bash "$TARGET/scripts/install.sh"
