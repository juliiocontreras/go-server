# Go Server

Servidor personal administrable desde móvil. Empieza en **Android + Termux** y puede migrar después a Linux/VPS sin cambiar la aplicación.

> Versión actual: **0.5.0**

## Instalación rápida

### Android / Termux

1. Instala Termux desde F-Droid o GitHub (evita la versión antigua de Play Store).
2. Abre Termux y ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/juliiocontreras/go-server/main/bootstrap.sh | bash
```

El instalador detecta Android, instala dependencias, genera tu token, configura PM2, crea `~/repos`, instala `cloudflared` y programa mantenimiento automático cada 30 minutos.

> Para arrancar automáticamente después de reiniciar Android, instala **Termux:Boot** y ábrelo una vez. El instalador ya deja creado el script de arranque.

### Linux / VPS

```bash
curl -fsSL https://raw.githubusercontent.com/juliiocontreras/go-server/main/bootstrap.sh | bash
```

Si ya clonaste el proyecto:

```bash
cd ~/go-server
bash scripts/install.sh
```

## Qué hace el instalador

- Detecta Termux o Linux.
- Verifica Node.js 20+ y Git.
- Instala PM2 cuando hace falta.
- Instala las dependencias de Go Server.
- En Termux instala Cloudflare Tunnel (`cloudflared`).
- Genera un `ADMIN_TOKEN` seguro.
- Te deja elegir puerto y carpeta de repositorios; Enter acepta los valores recomendados.
- Crea `.env` con permisos privados.
- Levanta `go-server` con PM2.
- Programa actualización y sincronización cada 30 minutos.
- En Android prepara el arranque con Termux:Boot.

## Panel móvil

Por defecto abre:

```text
http://127.0.0.1:8787
```

El panel es una PWA instalable. Permite consultar CPU, RAM, disco, uptime, proyectos Git y procesos PM2; reiniciar/detener servicios, ver logs, forzar backups, actualizar Go Server, desplegar repositorios y administrar acceso remoto.

## Acceso remoto — v0.5.0

Go Server ofrece dos métodos distintos:

### Tailscale Serve — privado

Ideal para administrar Go Server desde tus propios dispositivos sin abrir puertos del router.

1. Instala y conecta Tailscale en el dispositivo servidor.
2. En **Acceso remoto**, elige el puerto (por defecto `8787`).
3. Pulsa **Tailscale privado**.
4. Go Server configura `tailscale serve` sobre HTTPS y muestra la URL `*.ts.net` cuando está disponible.
5. El QR se genera localmente en Go Server para abrir el enlace desde otro dispositivo autorizado.

Tailscale Serve aplica las reglas de acceso de tu tailnet y termina HTTPS automáticamente cuando el tailnet está configurado para ello.

### Cloudflare Quick Tunnel — público temporal

Útil para demos o compartir una app por un periodo corto:

1. Escribe nombre y puerto de la app.
2. Pulsa **URL pública temporal**.
3. Go Server crea un proceso PM2 con `cloudflared` apuntando exclusivamente a `127.0.0.1:<puerto>`.
4. Recibes una URL HTTPS `*.trycloudflare.com` y su QR.
5. Pulsa **Cerrar URL temporal** cuando termines.

**Una Quick Tunnel es pública en Internet.** No la uses para exponer el dashboard administrativo salvo que entiendas el riesgo y mantengas el token privado.

### Dominio propio con Cloudflare

El panel también prepara la configuración para un hostname como `app.tudominio.com`. Por seguridad, Go Server 0.5 no guarda credenciales API de Cloudflare ni modifica tu zona DNS automáticamente. Te muestra exactamente:

- Hostname que debes publicar.
- Service URL local (`http://127.0.0.1:<puerto>`).
- Ruta en Cloudflare: **Networking → Tunnels → Routes → Add route → Published application**.

Esto mantiene los secretos de Cloudflare fuera del navegador y del repositorio.

## Agregar apps desde el celular

Desde la versión **0.4.0**, el dashboard incluye **Agregar una app**:

1. Pega una URL como `https://github.com/usuario/proyecto`.
2. Pulsa **Revisar repo** para validar enlace y obtener nombre/puerto sugeridos.
3. Pulsa **Clonar y publicar**.
4. Go Server clona, detecta el stack, instala dependencias, compila cuando aplica y registra la app en PM2.
5. El nombre y puerto quedan preparados automáticamente en la sección **Acceso remoto**.

Stacks soportados inicialmente:

- Vite.
- Next.js.
- Node.js con script `start`.

El despliegue no acepta comandos arbitrarios: usa planes predefinidos por stack y valida URL, nombre y puerto.

### Repositorios privados

En Android/Termux se instala GitHub CLI (`gh`). Conecta tu cuenta una sola vez:

```bash
gh auth login
gh auth setup-git
```

## Dashboard y procesos

- CPU, RAM, disco, hostname y uptime.
- Repositorios detectados con rama, commit y cambios pendientes.
- Procesos PM2 con estado, PID, CPU, RAM y reinicios.
- Reiniciar/detener procesos registrados.
- Logs recientes.
- Backup/sincronización manual.
- Actualización de Go Server desde `main`.

Todas las acciones administrativas requieren `ADMIN_TOKEN`.

## Backups de repositorios

Go Server usa `~/repos` por defecto. Clona ahí los proyectos que quieras sincronizar:

```bash
cd ~/repos
git clone git@github.com:juliiocontreras/rutie.git
git clone git@github.com:juliiocontreras/Shinext-Web.git
git clone git@github.com:juliiocontreras/hubie.git
```

Cada 30 minutos Go Server detecta cambios locales, crea un commit de respaldo y hace `git push` al remoto configurado de cada proyecto.

## Actualización automática

El mantenimiento ejecuta:

```bash
bash scripts/maintenance.sh
```

Los logs quedan en:

```text
~/.go-server/logs/maintenance.log
```

## Diagnóstico

```bash
cd ~/go-server
bash scripts/doctor.sh
```

Doctor revisa Node, Git, GitHub CLI, PM2, API y además indica si `cloudflared` y Tailscale están disponibles/conectados.

## Comandos útiles

```bash
pm2 status
pm2 logs go-server
pm2 restart go-server
npm test
node scripts/configure.mjs
bash scripts/maintenance.sh
```

## Migración

Para migrar de un teléfono/tablet a un VPS:

1. Instala Git y Node.js 20+ en el nuevo servidor.
2. Ejecuta el mismo `bootstrap.sh`.
3. Clona o copia tus repositorios a la carpeta configurada.
4. Configura GitHub/SSH.
5. Reconfigura Tailscale o Cloudflare Tunnel en el nuevo dispositivo.
6. Cambia DNS únicamente cuando el nuevo servidor esté validado.

Los repositorios son la fuente de verdad; Google Drive/OneDrive pueden utilizarse como copia adicional, no como ubicación desde la cual ejecutar las aplicaciones.

## Seguridad

- `.env` no se versiona.
- El instalador genera un token aleatorio.
- La API administrativa exige Bearer token.
- Los comandos remotos son operaciones predefinidas; no existe una terminal arbitraria desde el panel.
- Cloudflare Quick Tunnel enlaza únicamente a `127.0.0.1:<puerto>`.
- Prefiere Tailscale para administración privada.
- No publiques secretos en repositorios.
