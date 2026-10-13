import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export function isSafeProcessName(name = '') {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/.test(String(name));
}

async function gitInfo(cwd) {
  try {
    const [{ stdout: branchOut }, { stdout: commitOut }, { stdout: statusOut }] = await Promise.all([
      exec('git', ['branch', '--show-current'], { cwd, timeout: 5000 }),
      exec('git', ['rev-parse', '--short', 'HEAD'], { cwd, timeout: 5000 }),
      exec('git', ['status', '--porcelain'], { cwd, timeout: 5000 })
    ]);
    return { branch: branchOut.trim() || 'detached', commit: commitOut.trim(), dirty: Boolean(statusOut.trim()) };
  } catch {
    return { branch: null, commit: null, dirty: false };
  }
}

export async function discoverProjects(root) {
  const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
  const projects = [];
  for (const entry of entries.filter(e => e.isDirectory()).sort((a,b) => a.name.localeCompare(b.name))) {
    const cwd = join(root, entry.name);
    const isGit = await stat(join(cwd, '.git')).then(s => s.isDirectory()).catch(() => false);
    const info = isGit ? await gitInfo(cwd) : { branch: null, commit: null, dirty: false };
    projects.push({ name: entry.name, path: cwd, isGit, ...info });
  }
  return projects;
}

export async function pm2Processes() {
  try {
    const { stdout } = await exec('pm2', ['jlist'], { timeout: 8000, maxBuffer: 2_000_000 });
    const rows = JSON.parse(stdout || '[]');
    return rows.map(row => ({
      name: row.name,
      pid: row.pid || null,
      status: row.pm2_env?.status || 'unknown',
      cpu: row.monit?.cpu ?? null,
      memory: row.monit?.memory ?? null,
      restarts: row.pm2_env?.restart_time ?? 0,
      uptime: row.pm2_env?.pm_uptime || null
    }));
  } catch {
    return [];
  }
}

export async function pm2Action(name, action) {
  if (!isSafeProcessName(name)) throw new Error('invalid_process_name');
  if (!['start', 'restart', 'stop'].includes(action)) throw new Error('invalid_action');
  const processes = await pm2Processes();
  if (!processes.some(p => p.name === name)) throw new Error('process_not_found');
  const { stdout, stderr } = await exec('pm2', [action, name], { timeout: 20000, maxBuffer: 1_000_000 });
  return { stdout: stdout.trim(), stderr: stderr.trim() };
}

export async function pm2Logs(name, lines = 80) {
  if (!isSafeProcessName(name)) throw new Error('invalid_process_name');
  const processes = await pm2Processes();
  if (!processes.some(p => p.name === name)) throw new Error('process_not_found');
  const safeLines = Math.max(10, Math.min(300, Number(lines) || 80));
  const { stdout, stderr } = await exec('pm2', ['logs', name, '--lines', String(safeLines), '--nostream', '--raw'], { timeout: 10000, maxBuffer: 2_000_000 });
  return [stdout, stderr].filter(Boolean).join('\n').trim();
}
