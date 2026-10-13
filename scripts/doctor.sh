#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
FAIL=0
check() {
  local label="$1"; shift
  if "$@" >/dev/null 2>&1; then echo "✅ $label"; else echo "❌ $label"; FAIL=1; fi
}

echo "\n🩺 Go Server Doctor\n"
check "Node.js disponible" node --version
check "Git disponible" git --version
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then echo "✅ GitHub autenticado"; else echo "ℹ️  GitHub CLI instalado, pero falta autenticar (gh auth login)"; fi
else
  echo "ℹ️  GitHub CLI no está instalado; solo es necesario para facilitar repos privados"
fi
check "PM2 disponible" pm2 --version
[ -f .env ] && echo "✅ Configuración .env" || { echo "❌ Falta .env"; FAIL=1; }
[ -d "${HOME}/repos" ] && echo "✅ Carpeta de repositorios" || echo "ℹ️  La carpeta ~/repos aún no existe o se configuró otra ruta"
if command -v pm2 >/dev/null 2>&1 && pm2 describe go-server >/dev/null 2>&1; then
  echo "✅ Servicio go-server registrado en PM2"
else
  echo "❌ Servicio go-server no está registrado en PM2"; FAIL=1
fi
PORT="$(awk -F= '$1=="PORT"{print $2}' .env 2>/dev/null | tail -1)"
if command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:${PORT:-8787}/api/health" >/dev/null 2>&1; then
  echo "✅ API responde en http://127.0.0.1:${PORT:-8787}"
else
  echo "❌ API no responde en el puerto ${PORT:-8787}"; FAIL=1
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "🎉 Todo se ve bien."
else
  echo "⚠️  Hay elementos por corregir. Revisa: pm2 logs go-server"
fi
exit "$FAIL"
