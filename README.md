# Go Server

Servidor personal administrable desde móvil. Empieza en **Android + Termux** y puede migrar después a Linux/VPS sin cambiar la aplicación.

> Versión actual: **0.6.0**

## Instalación rápida

### Android / Termux

1. Instala Termux desde F-Droid o GitHub.
2. Abre Termux y ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/juliiocontreras/go-server/main/bootstrap.sh | bash
```

El instalador detecta Android, instala dependencias, genera el token administrativo, configura PM2, crea `~/repos`, instala `cloudflared` y programa mantenimiento automático.

> Para arrancar después de reiniciar Android, instala **Termux:Boot** y ábrelo una vez.

### Linux / VPS

```bash
curl -fsSL https://raw.githubusercontent.com/juliiocontreras/go-server/main/bootstrap.sh | bash
```

Si ya clonaste el proyecto:

```bash
cd ~/go-server
bash scripts/install.sh
```

## Panel móvil

Por defecto:

```text
http://127.0.0.1:8787
```

La PWA permite consultar CPU, RAM, disco, uptime, repositorios Git y procesos PM2; desplegar apps, administrar acceso remoto, sincronizar repositorios y gestionar backups/restauraciones.

Todas las acciones administrativas requieren `ADMIN_TOKEN`.

## Backup y migración — v0.6.0

Go Server 0.6 añade snapshots portables para recuperación y migración Android ↔ Linux/VPS:

- `.tar.gz` portable con manifiesto JSON.
- checksum SHA-256 antes de restaurar.
- secretos excluidos por defecto.
- historial desde el panel móvil.
- retención automática de **7 backups diarios + 4 semanales**.
- dry-run obligatorio antes de restaurar.
- plan de restauración temporal, de un solo uso.
- protección contra rutas absolutas, `..` y symlinks.
- los repositorios existentes nunca se sobrescriben.
- repositorios Git faltantes se reconstruyen desde su remoto cuando es posible.

La carpeta predeterminada es:

```text
~/.go-server/backups
```

Puedes modificarla con `BACKUPS_DIR`.

### Secretos

Los snapshots **no incluyen** `ADMIN_TOKEN`, `.env`, llaves SSH, `.pem`, `.key`, `.npmrc`, `credentials.json` ni `token.json`. Las credenciales privadas se vuelven a configurar manualmente en el servidor destino.

Guía completa: [`docs/BACKUP-MIGRATION.md`](docs/BACKUP-MIGRATION.md).

## Acceso remoto — v0.5+

### Tailscale Serve — privado

Ideal para administrar Go Server desde tus dispositivos sin abrir puertos del router. Desde **Acceso remoto**, selecciona el puerto y pulsa **Tailscale privado**. El panel muestra la URL `*.ts.net` y genera el QR localmente cuando está disponible.

### Cloudflare Quick Tunnel — público temporal

Útil para demos o compartir una app por un periodo corto. El túnel apunta exclusivamente a `127.0.0.1:<puerto>` y entrega una URL HTTPS `*.trycloudflare.com`.

**Una Quick Tunnel es pública en Internet.** Para administración privada prefiere Tailscale.

### Dominio propio con Cloudflare

El panel prepara el hostname y Service URL que debes configurar en **Networking → Tunnels → Routes → Add route → Published application**. Go Server no guarda credenciales API de Cloudflare en el navegador.

## Agregar apps desde el celular

Desde **Agregar una app**:

1. Pega una URL de GitHub.
2. Pulsa **Revisar repo**.
3. Go Server valida el enlace y propone nombre/puerto.
4. Pulsa **Clonar y publicar**.
5. Detecta el stack, instala dependencias, compila cuando aplica y registra el proceso en PM2.

Stacks iniciales:

- Vite.
- Next.js.
- Node.js con script `start`.

El despliegue usa operaciones predefinidas; el panel no expone una terminal arbitraria.

### Repositorios privados

```bash
gh auth login
gh auth setup-git
```

## Backups de repositorios Git

`~/repos` sigue siendo la carpeta de proyectos por defecto. Ejemplo:

```bash
cd ~/repos
git clone git@github.com:juliiocontreras/rutie.git
git clone git@github.com:juliiocontreras/Shinext-Web.git
git clone git@github.com:juliiocontreras/hubie.git
```

La sincronización Git y el snapshot portable son complementarios: Git conserva el código versionado; el snapshot conserva estado portable y archivos locales seleccionados.

## Mantenimiento automático

```bash
bash scripts/maintenance.sh
```

El mantenimiento realiza actualización de Go Server, snapshot portable cuando `AUTO_BACKUP=true` y sincronización Git. Un fallo de backup queda registrado pero no bloquea los demás pasos.

Logs:

```text
~/.go-server/logs/maintenance.log
```

Configuración relevante:

```text
REPOS_DIR=...
BACKUPS_DIR=...
AUTO_UPDATE=true
SYNC_REPOS=true
AUTO_BACKUP=true
```

## Diagnóstico

```bash
cd ~/go-server
bash scripts/doctor.sh
```

## Comandos útiles

```bash
pm2 status
pm2 logs go-server
pm2 restart go-server
npm test
node scripts/configure.mjs
node scripts/backup.mjs
bash scripts/maintenance.sh
```

## Migración a otro dispositivo/VPS

1. Crea y verifica un backup desde el panel del servidor actual.
2. Instala Go Server en el dispositivo nuevo.
3. Copia los archivos `.tar.gz`, `.json` y `.sha256` del snapshot a su `BACKUPS_DIR`.
4. Conecta GitHub si hay repos privados.
5. Abre **Backup y migración** y prepara la restauración.
6. Revisa el dry-run y confirma.
7. Reconfigura secretos y acceso remoto.
8. Verifica las apps antes de cambiar DNS o retirar el servidor anterior.

Google Drive/OneDrive pueden utilizarse como copia secundaria; su sincronización automática se plantea para una versión posterior.

## Seguridad

- `.env` no se versiona ni entra en el backup portable.
- El instalador genera un token administrativo aleatorio.
- La API administrativa exige Bearer token.
- La restauración se realiza en staging y valida rutas antes de extraer.
- Los tokens de restauración expiran y son de un solo uso.
- Los repositorios existentes no se sobrescriben durante una migración.
- Cloudflare Quick Tunnel enlaza solo a `127.0.0.1:<puerto>`.
- Prefiere Tailscale para administración privada.
