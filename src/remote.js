import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export function validateRemotePort(input) {
  const value = Number(input);
  if (!Number.isInteger(value) || value < 1024 || value > 65535) throw new Error('invalid_port');
  return value;
}

export function normalizeTunnelName(input = '') {
  const raw = String(input).trim();
  if (!raw || raw.includes('..') || raw.includes('/') || raw.includes('\\')) throw new Error('invalid_tunnel_name');
  const value = raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value)) throw new Error('invalid_tunnel_name');
  return value;
}

export function cloudflareQuickArgs(port) {
  const p = validateRemotePort(port);
  return ['tunnel', '--no-autoupdate', '--url', `http://127.0.0.1:${p}`];
}

export function tailscaleServeArgs(port) {
  const p = validateRemotePort(port);
  return ['serve', '--bg', '--yes', `http://127.0.0.1:${p}`];
}

export function extractTryCloudflareUrl(text = '') {
  const match = String(text).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i);
  return match ? match[0] : null;
}

export function extractTailscaleHttpsUrl(text = '') {
  const match = String(text).match(/https:\/\/[a-z0-9.-]+\.ts\.net\b/i);
  return match ? match[0] : null;
}


export function validateShareUrl(input = '') {
  let u;
  try { u = new URL(String(input).trim()); } catch { throw new Error('invalid_share_url'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || String(input).length > 2048) throw new Error('invalid_share_url');
  return u.toString();
}

export function cloudflareHostnameGuide(hostname, port) {
  const host = String(hostname || '').trim().toLowerCase();
  if (!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(host)) throw new Error('invalid_hostname');
  const p = validateRemotePort(port);
  return {
    hostname: host,
    service: `http://127.0.0.1:${p}`,
    summary: `Publica ${host} y apunta el servicio del túnel a http://127.0.0.1:${p}`
  };
}

async function exists(command) {
  try {
    await exec(command, ['--version'], { timeout: 5000 });
    return true;
  } catch {
    try {
      await exec('which', [command], { timeout: 5000 });
      return true;
    } catch { return false; }
  }
}

export async function remoteStatus() {
  const [cloudflared, tailscale] = await Promise.all([exists('cloudflared'), exists('tailscale')]);
  let tailscaleUrl = null;
  let tailscaleOnline = false;
  if (tailscale) {
    try {
      const { stdout } = await exec('tailscale', ['status', '--json'], { timeout: 7000, maxBuffer: 1_000_000 });
      const data = JSON.parse(stdout);
      tailscaleOnline = data.BackendState === 'Running';
      const dns = data.Self?.DNSName?.replace(/\.$/, '');
      if (dns) tailscaleUrl = `https://${dns}`;
    } catch {}
  }
  return { cloudflared: { installed: cloudflared }, tailscale: { installed: tailscale, online: tailscaleOnline, url: tailscaleUrl } };
}

export async function startCloudflareQuickTunnel({ name, port }) {
  const safe = normalizeTunnelName(name);
  const p = validateRemotePort(port);
  if (!(await exists('cloudflared'))) throw new Error('cloudflared_not_installed');
  const processName = `cf-${safe}`;
  await exec('pm2', ['delete', processName], { timeout: 15000 }).catch(() => {});
  await exec('pm2', ['start', 'cloudflared', '--name', processName, '--', ...cloudflareQuickArgs(p)], { timeout: 30000, maxBuffer: 2_000_000 });
  await exec('pm2', ['save'], { timeout: 15000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1800));
  let logs = '';
  try {
    const { stdout, stderr } = await exec('pm2', ['logs', processName, '--lines', '80', '--nostream'], { timeout: 10000, maxBuffer: 2_000_000 });
    logs = `${stdout}\n${stderr}`;
  } catch {}
  return { processName, url: extractTryCloudflareUrl(logs), port: p };
}

export async function stopCloudflareQuickTunnel(name) {
  const processName = `cf-${normalizeTunnelName(name)}`;
  await exec('pm2', ['delete', processName], { timeout: 15000, maxBuffer: 1_000_000 });
  await exec('pm2', ['save'], { timeout: 15000 }).catch(() => {});
  return { processName };
}

export async function enableTailscaleServe(port) {
  const p = validateRemotePort(port);
  if (!(await exists('tailscale'))) throw new Error('tailscale_not_installed');
  const { stdout, stderr } = await exec('tailscale', tailscaleServeArgs(p), { timeout: 30000, maxBuffer: 2_000_000 });
  let url = extractTailscaleHttpsUrl(`${stdout}\n${stderr}`);
  if (!url) {
    try {
      const status = await remoteStatus();
      url = status.tailscale.url;
    } catch {}
  }
  return { port: p, url };
}

export async function disableTailscaleServe() {
  if (!(await exists('tailscale'))) throw new Error('tailscale_not_installed');
  await exec('tailscale', ['serve', 'reset'], { timeout: 30000, maxBuffer: 1_000_000 });
  return { reset: true };
}
