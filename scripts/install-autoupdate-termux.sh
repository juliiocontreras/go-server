#!/data/data/com.termux/files/usr/bin/bash
set -euo pipefail
mkdir -p "$HOME/.termux/tasker" "$HOME/bin"
cat > "$HOME/bin/go-server-auto.sh" <<'SH'
#!/data/data/com.termux/files/usr/bin/bash
cd "$HOME/go-server" || exit 1
bash scripts/self-update.sh
node scripts/sync-repos.js
SH
chmod +x "$HOME/bin/go-server-auto.sh"
echo 'Programa $HOME/bin/go-server-auto.sh cada 30 min con Termux:JobScheduler/Tasker o cron.'
