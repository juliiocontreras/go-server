#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

is_termux=false
if [ -n "${PREFIX:-}" ] && [[ "$PREFIX" == *com.termux* ]]; then is_termux=true; fi

banner() {
  printf '\n========================================\n'
  printf '        Go Server Installer\n'
  printf '========================================\n\n'
}

banner
if $is_termux; then
  echo "📱 Android/Termux detectado"
  pkg update -y
  pkg install -y git gh nodejs-lts openssh termux-api termux-services cronie cloudflared
else
  echo "🖥️  Linux detectado"
  command -v node >/dev/null 2>&1 || { echo "❌ Instala Node.js 20 o superior y vuelve a ejecutar este instalador."; exit 1; }
  command -v git >/dev/null 2>&1 || { echo "❌ Git es necesario para las actualizaciones automáticas."; exit 1; }
fi

node_major="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "$node_major" -lt 20 ]; then
  echo "❌ Se requiere Node.js 20 o superior. Versión actual: $(node -v)"
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "📦 Instalando PM2..."
  npm install -g pm2
fi

echo "📦 Instalando dependencias de Go Server..."
npm install --omit=dev --no-audit --no-fund

if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    gh auth setup-git >/dev/null 2>&1 || true
    echo "✅ GitHub autenticado para repositorios privados"
  else
    echo "ℹ️  GitHub aún no está conectado. Para repos privados ejecuta después: gh auth login && gh auth setup-git"
  fi
fi

node scripts/configure.mjs

mkdir -p "$HOME/.go-server/logs"
pm2 delete go-server >/dev/null 2>&1 || true
pm2 start src/server.js --name go-server --cwd "$ROOT" --time
pm2 save

if $is_termux; then
  termux-wake-lock >/dev/null 2>&1 || true
  (crontab -l 2>/dev/null | grep -v 'go-server/scripts/maintenance.sh' || true; echo "*/30 * * * * bash '$ROOT/scripts/maintenance.sh'") | crontab -
  sv-enable crond >/dev/null 2>&1 || true
  sv up crond >/dev/null 2>&1 || true
  mkdir -p "$HOME/.termux/boot"
  cat > "$HOME/.termux/boot/go-server.sh" <<BOOT
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
pm2 resurrect
sv up crond >/dev/null 2>&1 || true
BOOT
  chmod +x "$HOME/.termux/boot/go-server.sh"
  echo "✅ Inicio automático preparado. Para ejecutarlo al reiniciar Android instala Termux:Boot desde F-Droid/GitHub y ábrelo una vez."
else
  if command -v crontab >/dev/null 2>&1; then
    (crontab -l 2>/dev/null | grep -v 'go-server/scripts/maintenance.sh' || true; echo "*/30 * * * * bash '$ROOT/scripts/maintenance.sh'") | crontab -
  else
    echo "ℹ️  No encontré cron ; Go Server funciona, pero instala cron para mantenimiento automático cada 30 minutos."
  fi
  pm2 startup 2>/dev/null || true
fi

PORT="$(awk -F= '$1=="PORT"{print $2}' .env | tail -1)"
TOKEN="$(awk -F= '$1=="ADMIN_TOKEN"{sub(/^ADMIN_TOKEN=/,""); print}' .env | tail -1)"

echo
echo "🎩 Go Server está listo"
echo "🌠 Abre: http://127.0.0.1:${PORT:-8787}"
echo "🔐 Token: ${TOKEN}"
echo "🔈 Actualización y respaldo: cada 30 minutos"
if command -v cloudflared >/dev/null 2>&1; then echo "☁️  Cloudflare Quick Tunnel: disponible desde el panel"; fi
if command -v tailscale >/dev/null 2>&1; then echo "🔒 Tailscale: detectado y disponible desde el panel"; else echo "ℹ️  Tailscale es opcional; instálalo/conéctalo si quieres acceso privado HTTPS."; fi
echo
echo "Comandos útiles:"
echo "  pm2 status"
echo "  pm2 logs go-server"
echo "  pm2 restart go-server"
echo
