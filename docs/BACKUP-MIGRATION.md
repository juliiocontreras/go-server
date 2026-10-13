# Backup y migración — Go Server 0.6

Go Server 0.6 crea snapshots portables para mover la configuración operativa y reconstruir proyectos entre Android/Termux y Linux/VPS.

## Qué incluye

- `manifest.json` con versión del formato, fecha, plataforma y metadatos Git de cada repositorio.
- Configuración segura de Go Server: `PORT`, `HOST`, `AUTO_UPDATE`, `SYNC_REPOS` y `AUTO_BACKUP`.
- `package.json` y `.env.example` como referencia.
- Opcionalmente, archivos locales de los repositorios sin `.git`, `node_modules` ni secretos.
- Archivo `.tar.gz`, metadata JSON y checksum SHA-256.

## Qué no incluye

Por diseño no se guardan:

- `ADMIN_TOKEN`.
- `.env` ni `.env.*`.
- llaves SSH o contenido de `.ssh`.
- archivos `.pem` o `.key`.
- `credentials.json`, `token.json` o `.npmrc`.

Reconfigura esos secretos manualmente en el servidor destino.

## Ubicación y retención

Por defecto:

```text
~/.go-server/backups
```

La retención automática conserva hasta **7 snapshots diarios + 4 snapshots semanales**. Puedes cambiar la carpeta con `BACKUPS_DIR`.

## Crear y verificar un backup

Desde el panel móvil abre **Backup y migración** y pulsa **Crear backup**. La opción **Incluir archivos locales** es útil para proyectos sin remoto Git, pero puede aumentar considerablemente el tamaño.

Cada snapshot puede verificarse desde el mismo panel. Go Server recalcula SHA-256 y compara el resultado con la metadata almacenada antes de permitir una restauración.

## Restauración segura

La restauración siempre usa dos fases:

1. **Preparar restauración**: verifica checksum y archivo, inspecciona rutas, rechaza traversal/symlinks y muestra un dry-run.
2. **Confirmar restauración**: ejecuta únicamente las operaciones del plan temporal generado en la fase anterior.

El token de plan dura 10 minutos y solo puede usarse una vez.

Los repositorios existentes **no se sobrescriben**. Si falta un repositorio con remoto Git, Go Server lo clona de nuevo; si no tiene remoto y el backup incluye archivos locales, puede reconstruirlo desde el snapshot.

## Migrar Android → Linux/VPS

1. Instala Go Server en el servidor nuevo con `bootstrap.sh`.
2. Conecta GitHub (`gh auth login`) si usas repositorios privados.
3. Copia los tres archivos del snapshot al `BACKUPS_DIR` del servidor nuevo:
   - `go-server-YYYYMMDD-HHMMSS.tar.gz`
   - `go-server-YYYYMMDD-HHMMSS.json`
   - `go-server-YYYYMMDD-HHMMSS.sha256`
4. Abre el panel del nuevo servidor.
5. En **Backup y migración**, actualiza el historial y pulsa **Preparar restauración**.
6. Revisa el dry-run y confirma.
7. Vuelve a configurar secretos, credenciales, Tailscale/Cloudflare y variables privadas que el backup excluyó.
8. Verifica las apps antes de cambiar DNS o retirar el servidor anterior.

## Copiar el snapshot

Puedes transferirlo por `scp`, USB/almacenamiento local o una carpeta sincronizada. Google Drive y OneDrive pueden usarse como destino secundario, pero la integración automática con proveedores cloud queda para una versión posterior.

## Seguridad

- Solo se restauran backups ubicados en el directorio gestionado por Go Server.
- Se rechazan rutas absolutas, `..`, symlinks y archivos que intenten salir del staging.
- El checksum se verifica antes de la restauración y nuevamente al ejecutar el plan.
- Go Server guarda una copia de seguridad de la configuración segura previa antes de aplicar una restauración.
- Los secretos permanecen fuera del snapshot por defecto.
