# Go Server 0.6.0 Backup & Migration Implementation Plan

**Goal:** añadir backups locales portables, verificación, restauración guiada, retención y migración Android↔Linux/VPS sin exponer secretos por defecto.

**Architecture:** `src/backups.js` concentra manifiesto, creación del archive, checksums, retención y restauración; `src/server.js` expone endpoints autenticados; `scripts/backup.mjs` integra snapshots al mantenimiento; la PWA consume únicamente esas APIs.

## Task 1 — Backup core

- Manifiesto portable sin rutas absolutas del host origen.
- Exclusión de `.env`, SSH, certificados y credenciales.
- `.tar.gz` + SHA-256 + metadata JSON.
- Retención 7 diarios + 4 semanales.
- TDD en `tests/backups.test.js`.

## Task 2 — Restore/migration seguro

- Validación de rutas de archive.
- Rechazo de traversal y symlinks.
- Staging aislado.
- Dry-run obligatorio.
- Token de plan de 10 minutos, un solo uso.
- No sobrescribir repositorios existentes.
- Re-clonar repos Git faltantes cuando exista remoto.
- TDD en `tests/restore.test.js`.

## Task 3 — API y mantenimiento

Endpoints autenticados:

- `GET /api/backups`
- `POST /api/backups/create`
- `POST /api/backups/:id/verify`
- `POST /api/backups/:id/restore/plan`
- `POST /api/backups/restore/execute`

El mantenimiento ejecuta backup automático cuando `AUTO_BACKUP=true`; un fallo se registra y no bloquea la sincronización Git.

## Task 4 — Dashboard y release

- Panel **Backup y migración** para historial, crear, verificar, dry-run y confirmar restore.
- Versión `0.6.0`.
- Actualización de service worker para invalidar caché 0.5.
- `docs/BACKUP-MIGRATION.md` y README.
- CI limpio: `npm install --no-audit --no-fund` + `npm test`.

## Fuera de alcance 0.6.0

- Sincronización automática con Google Drive/OneDrive/S3.
- Incluir secretos en backups desde la UI.
- Sobrescribir working trees Git existentes.
