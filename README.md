# Go Server

Servidor personal mobile-first para alojar y administrar apps desde Android/Termux o Linux, con PWA de administración, PM2, sincronización Git y despliegue guiado desde GitHub.

> Versión actual: **0.4.0**

## Instalación rápida

### Android / Termux

```bash
pkg update -y && pkg install -y curl
curl -fsSL https://raw.githubusercontent.com/juliiocontreras/go-server/main/bootstrap.sh | bash
```

### Linux

```bash
curl -fsSL https://raw.githubusercontent.com/juliiocontreras/go-server/main/bootstrap.sh | bash
```

El instalador detecta automáticamente el entorno, instala dependencias, genera un `ADMIN_TOKEN`, configura PM2, prepara la carpeta de repositorios y activa mantenimiento automático.

## Funciones

- Panel PWA responsive para celular, tablet y escritorio.
- Métricas de CPU, RAM, disco, hostname y uptime.
- Detección de repositorios Git locales.
- Estado de rama, commit y cambios pendientes.
- Administración de procesos PM2.
- Reiniciar/detener procesos desde el panel.
- Logs recientes por proceso.
- Backup/sincronización manual y automática de repositorios.
- Auto-update del propio Go Server.
- Asistente para agregar apps desde GitHub.
- Detección automática de Vite, Next.js y Node.js.
- Asignación automática de puertos.
- Soporte para repos privados mediante GitHub CLI.
- `doctor.sh` para diagnóstico rápido.

## Repositorios privados

En el dispositivo autentica GitHub una vez:

```bash
gh auth login
gh auth setup-git
```

Después Go Server podrá clonar repositorios privados accesibles por tu cuenta.

## Seguridad

El panel no expone una terminal arbitraria. Las acciones remotas están limitadas a operaciones predefinidas, nombres de procesos conocidos y planes de despliegue por stack. El acceso administrativo requiere `ADMIN_TOKEN`.

## Desarrollo

```bash
npm install
npm test
npm start
```

Por defecto el servidor escucha en el puerto configurado en `.env`.

## Estructura

```text
src/        API y lógica del servidor
public/     Dashboard/PWA
scripts/    Instalación, mantenimiento y sincronización
tests/      Pruebas automatizadas
```
