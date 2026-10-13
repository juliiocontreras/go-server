# Go Server

Servidor personal administrable desde móvil. Está pensado para empezar en **Android + Termux** y migrar después a Linux/VPS sin cambiar la aplicación.

## Instalación rápida

### Android / Termux

1. Instala Termux desde F-Droid o GitHub (evita la versión antigua de Play Store).
2. Abre Termux y ejecuta:

```bash
curl -fsSL https://raw.githubusercontent.com/juliiocontreras/go-server/main/bootstrap.sh | bash
```

El instalador detecta Android, instala dependencias, genera tu token, configura PM2, crea `~/repos` y programa mantenimiento automático cada 30 minutos.

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
- Genera un `ADMIN_TOKEN` seguro.
- Te deja elegir puerto y carpeta de repositorios; Enter acepta los valores recomendados.
- Crea la configuración `.env` con permisos privados.
- Levanta `go-server` con PM2.
- Programa actualización y sincronización cada 30 minutos.
- En Android prepara el arranque con Termux:Boot.

Al terminar muestra la URL local y el token administrativo.

## Panel móvil

Por defecto abre:

```text
http://127.0.0.1:8787
```

El panel es una PWA y puede añadirse a la pantalla de inicio. Desde ahí puedes consultar CPU, RAM, disco, uptime, proyectos Git y procesos PM2; también puedes reiniciar/detener servicios, ver logs, forzar backups y lanzar una actualización manual.

Para entrar desde otro dispositivo utiliza una VPN privada como Tailscale/WireGuard. **No expongas el puerto 8787 directamente a Internet.**

## Dashboard móvil

La versión 0.3.0 añade un panel de administración pensado para teléfono:

- CPU, RAM, disco, hostname y uptime.
- Repositorios detectados con rama, commit y cambios pendientes.
- Procesos PM2 con estado, PID, CPU, RAM y reinicios.
- Botones seguros para reiniciar o detener procesos registrados.
- Logs recientes por proceso.
- Backup/sincronización manual y actualización de Go Server.

Todas las acciones administrativas requieren `ADMIN_TOKEN`.

## Backups de repositorios

Go Server usa `~/repos` por defecto. Clona ahí los proyectos que quieras sincronizar:

```bash
cd ~/repos
git clone git@github.com:juliiocontreras/rutie.git
git clone git@github.com:juliiocontreras/Shinext-Web.git
git clone git@github.com:juliiocontreras/hubie.git
```

Puedes agregar Jobia y cualquier otro repositorio del mismo modo. Cada 30 minutos Go Server detecta cambios locales, crea un commit de respaldo y hace `git push` al remoto configurado de cada proyecto.

> Para repos privados se recomienda configurar una llave SSH en el dispositivo y añadirla a GitHub.

## Actualización automática

El mantenimiento ejecuta:

```bash
bash scripts/maintenance.sh
```

Eso actualiza Go Server desde `origin/main` y después sincroniza los repositorios configurados. Los logs quedan en:

```text
~/.go-server/logs/maintenance.log
```

## Diagnóstico

Si algo no funciona:

```bash
cd ~/go-server
bash scripts/doctor.sh
```

Después puedes revisar:

```bash
pm2 status
pm2 logs go-server
```

## Comandos útiles

```bash
pm2 restart go-server
pm2 stop go-server
pm2 start go-server
npm test
node scripts/configure.mjs
bash scripts/maintenance.sh
```

## Migración

La configuración está pensada para ser portable. Para migrar de un teléfono/tablet a un VPS:

1. Instala Git y Node.js 20+ en el nuevo servidor.
2. Ejecuta el mismo `bootstrap.sh`.
3. Clona o copia tus repositorios a la carpeta configurada.
4. Configura la misma llave SSH de GitHub o una nueva.
5. Cambia DNS/proxy únicamente cuando el nuevo servidor esté validado.

Los repositorios son la fuente de verdad; Google Drive/OneDrive pueden utilizarse como copia adicional, no como ubicación desde la cual ejecutar las aplicaciones.

## Seguridad

- `.env` no se versiona.
- El instalador genera un token aleatorio.
- Usa SSH para GitHub.
- Usa VPN para administración remota.
- No publiques secretos en repositorios.
- Revisa periódicamente `bash scripts/doctor.sh` y los logs de PM2.

## Agregar apps desde el celular

Desde la versión **0.4.0**, el dashboard incluye el asistente **Agregar una app**:

1. Pega una URL como `https://github.com/usuario/proyecto`.
2. Toca **Revisar repo** para validar el enlace y recibir nombre/puerto sugeridos.
3. Toca **Clonar y publicar**.
4. Go Server clona el proyecto, detecta el stack, instala dependencias, compila cuando aplica y registra la app en PM2.
5. El panel muestra la URL local de la app y el proceso aparece inmediatamente en la sección PM2.

Stacks soportados inicialmente:

- Vite.
- Next.js.
- Node.js con script `start`.

El despliegue no acepta comandos arbitrarios: usa planes predefinidos por stack y valida URL, nombre y puerto. La casilla de publicación explica claramente que `npm install` y los scripts de build ejecutan código del repositorio; úsala solo con repos de confianza.

### Repositorios privados

En Android/Termux, Go Server instala GitHub CLI (`gh`). Para conectar tu cuenta una sola vez:

```bash
gh auth login
gh auth setup-git
```

Después el mismo asistente puede clonar repositorios privados a los que tu cuenta tenga acceso. En Linux/VPS puedes instalar GitHub CLI o configurar SSH/credenciales Git por tu cuenta.
