import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import QRCode from 'qrcode';
import { getConfig } from './config.js';
import { loadEnvFile } from './env.js';
import { systemSnapshot } from './system.js';
import { discoverProjects, pm2Processes, pm2Action, pm2Logs } from './projects.js';
import { inspectRepository, findAvailablePort, provisionApp } from './apps.js';
import { createBackup, listBackups, verifyBackup, planRestore, executeRestore } from './backups.js';
import {
  remoteStatus,
  startCloudflareQuickTunnel,
  stopCloudflareQuickTunnel,
  enableTailscaleServe,
  disableTailscaleServe,
  cloudflareHostnameGuide,
  validateShareUrl
} from './remote.js';

const exec = promisify(execFile);
const cfg = getConfig(loadEnvFile());

function json(res, status, body) {
  res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'});
  res.end(JSON.stringify(body));
}

function authorized(req) {
  if (!cfg.adminToken) return false;
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${cfg.adminToken}`;
}

async function git(args, cwd) {
  const { stdout } = await exec('git', args, { cwd, timeout: 15000 });
  return stdout.trim();
}

async function body(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 64_000) throw new Error('request_too_large');
  }
  if (!data) return {};
  return JSON.parse(data);
}

function serveFile(res, relativeUrl, contentType, headers = {}) {
  return readFile(new URL(relativeUrl, import.meta.url)).then(file => {
    res.writeHead(200, {'content-type': contentType, ...headers});
    res.end(file);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/health') return json(res, 200, {ok:true, service:'Go Server', time:new Date().toISOString()});

    if (url.pathname.startsWith('/api/') && !authorized(req)) return json(res, 401, {error:'unauthorized'});

    if (url.pathname === '/api/status') {
      let commit = null;
      try { commit = await git(['rev-parse','--short','HEAD'], process.cwd()); } catch {}
      return json(res, 200, {ok:true, commit, uptime:Math.round(process.uptime()), node:process.version, platform:process.platform});
    }

    if (url.pathname === '/api/dashboard') {
      const [system, projects, processes] = await Promise.all([
        systemSnapshot(cfg.reposDir), discoverProjects(cfg.reposDir), pm2Processes()
      ]);
      return json(res, 200, {ok:true, system, projects, processes, reposDir:cfg.reposDir});
    }

    if (url.pathname === '/api/backups' && req.method === 'GET') {
      return json(res, 200, {ok:true, backups:await listBackups({backupsDir:cfg.backupsDir}), backupsDir:cfg.backupsDir});
    }

    if (url.pathname === '/api/backups/create' && req.method === 'POST') {
      const input = await body(req);
      const backup = await createBackup({
        rootDir: process.cwd(), reposDir: cfg.reposDir, backupsDir: cfg.backupsDir,
        includeRepoFiles: input.includeRepoFiles === true
      });
      return json(res, 200, {ok:true, backup});
    }

    const verifyMatch = url.pathname.match(/^\/api\/backups\/([^/]+)\/verify$/);
    if (verifyMatch && req.method === 'POST') {
      const verification = await verifyBackup(decodeURIComponent(verifyMatch[1]), {backupsDir:cfg.backupsDir});
      return json(res, 200, {ok:true, verification});
    }

    const restorePlanMatch = url.pathname.match(/^\/api\/backups\/([^/]+)\/restore\/plan$/);
    if (restorePlanMatch && req.method === 'POST') {
      const restore = await planRestore(decodeURIComponent(restorePlanMatch[1]), {
        backupsDir: cfg.backupsDir, reposDir: cfg.reposDir, rootDir: process.cwd()
      });
      return json(res, 200, {ok:true, restore});
    }

    if (url.pathname === '/api/backups/restore/execute' && req.method === 'POST') {
      const input = await body(req);
      const restore = await executeRestore(input.planToken);
      return json(res, 200, {ok:true, restore});
    }

    if (url.pathname === '/api/remote/status') {
      return json(res, 200, {ok:true, ...(await remoteStatus())});
    }

    if (url.pathname === '/api/remote/cloudflare/start' && req.method === 'POST') {
      const input = await body(req);
      const result = await startCloudflareQuickTunnel({name:input.name, port:input.port});
      return json(res, 200, {ok:true, ...result});
    }

    if (url.pathname === '/api/remote/cloudflare/stop' && req.method === 'POST') {
      const input = await body(req);
      const result = await stopCloudflareQuickTunnel(input.name);
      return json(res, 200, {ok:true, ...result});
    }

    if (url.pathname === '/api/remote/tailscale/serve' && req.method === 'POST') {
      const input = await body(req);
      const result = await enableTailscaleServe(input.port);
      return json(res, 200, {ok:true, ...result});
    }

    if (url.pathname === '/api/remote/tailscale/reset' && req.method === 'POST') {
      return json(res, 200, {ok:true, ...(await disableTailscaleServe())});
    }

    if (url.pathname === '/api/remote/cloudflare/hostname/guide' && req.method === 'POST') {
      const input = await body(req);
      return json(res, 200, {ok:true, ...cloudflareHostnameGuide(input.hostname, input.port)});
    }

    if (url.pathname === '/api/qr') {
      const shareUrl = validateShareUrl(url.searchParams.get('url') || '');
      const svg = await QRCode.toString(shareUrl, {type:'svg', margin:1, errorCorrectionLevel:'M', width:240});
      res.writeHead(200, {'content-type':'image/svg+xml; charset=utf-8','cache-control':'no-store'});
      return res.end(svg);
    }

    if (url.pathname === '/api/update' && req.method === 'POST') {
      const { stdout, stderr } = await exec('bash', ['scripts/self-update.sh'], {cwd:process.cwd(), timeout:120000});
      return json(res, 200, {ok:true, stdout:stdout.trim(), stderr:stderr.trim()});
    }

    if (url.pathname === '/api/sync' && req.method === 'POST') {
      const { stdout, stderr } = await exec(process.execPath, ['scripts/sync-repos.js'], {cwd:process.cwd(), timeout:180000, maxBuffer:2_000_000});
      return json(res, 200, {ok:true, stdout:stdout.trim(), stderr:stderr.trim()});
    }

    if (url.pathname === '/api/process/action' && req.method === 'POST') {
      const input = await body(req);
      const result = await pm2Action(input.name, input.action);
      return json(res, 200, {ok:true, ...result});
    }

    if (url.pathname === '/api/process/logs') {
      const name = url.searchParams.get('name') || '';
      const lines = url.searchParams.get('lines') || 80;
      const logs = await pm2Logs(name, lines);
      return json(res, 200, {ok:true, name, logs});
    }

    if (url.pathname === '/api/apps/inspect' && req.method === 'POST') {
      const input = await body(req);
      const app = await inspectRepository(input.repoUrl, cfg.reposDir);
      const suggestedPort = await findAvailablePort();
      return json(res, 200, {ok:true, ...app, suggestedPort});
    }

    if (url.pathname === '/api/apps/deploy' && req.method === 'POST') {
      const input = await body(req);
      const result = await provisionApp({
        repoUrl: input.repoUrl,
        name: input.name,
        port: input.port,
        reposDir: cfg.reposDir,
        install: input.install !== false
      });
      return json(res, 200, {ok:true, ...result});
    }

    if (url.pathname === '/' || url.pathname === '/index.html') return serveFile(res, '../public/index.html', 'text/html; charset=utf-8');
    if (url.pathname === '/app.js') return serveFile(res, '../public/app.js', 'application/javascript; charset=utf-8');
    if (url.pathname === '/manifest.webmanifest') return serveFile(res, '../public/manifest.webmanifest', 'application/manifest+json');
    if (url.pathname === '/sw.js') return serveFile(res, '../public/sw.js', 'application/javascript; charset=utf-8', {'service-worker-allowed':'/'});

    json(res,404,{error:'not_found'});
  } catch (e) {
    const known = [
      'invalid_process_name','invalid_action','process_not_found','request_too_large','invalid_repository_url',
      'invalid_project_name','invalid_port','unsupported_stack','no_available_port','invalid_tunnel_name',
      'invalid_hostname','invalid_share_url','cloudflared_not_installed','tailscale_not_installed',
      'invalid_backup_id','backup_checksum_mismatch','invalid_archive','unsupported_backup_format',
      'restore_plan_invalid','restore_plan_expired'
    ];
    json(res, known.includes(e.message) ? 400 : 500, {error: known.includes(e.message) ? e.message : 'internal_error', message:e.message});
  }
});

server.listen(cfg.port, cfg.host, () => console.log(`Go Server http://${cfg.host}:${cfg.port}`));
