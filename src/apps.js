import { readFile, access, mkdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import net from 'node:net';

const exec = promisify(execFile);

export function validateRepositoryUrl(input = '') {
  let u;
  try { u = new URL(String(input).trim()); } catch { throw new Error('invalid_repository_url'); }
  if (u.protocol !== 'https:' || u.hostname !== 'github.com' || u.username || u.password || u.search || u.hash) {
    throw new Error('invalid_repository_url');
  }
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length !== 2) throw new Error('invalid_repository_url');
  const [owner, rawRepo] = parts;
  const repo = rawRepo.replace(/\.git$/i, '');
  const safe = /^[A-Za-z0-9_.-]+$/;
  if (!safe.test(owner) || !safe.test(repo) || !repo) throw new Error('invalid_repository_url');
  return `https://github.com/${owner}/${repo}.git`;
}

export function projectNameFromRepoUrl(input = '') {
  const url = validateRepositoryUrl(input);
  return new URL(url).pathname.split('/').filter(Boolean)[1].replace(/\.git$/i, '');
}

export function normalizeProjectName(input = '') {
  const raw = String(input).trim();
  if (raw.includes('..') || raw.includes('/') || raw.includes('\\')) throw new Error('invalid_project_name');
  const value = raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!/^[a-z0-9][a-z0-9._-]{0,79}$/.test(value)) throw new Error('invalid_project_name');
  return value;
}

export async function detectStack(cwd) {
  try {
    const pkg = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'));
    const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
    const scripts = pkg.scripts || {};
    let kind = 'node';
    if (deps.next) kind = 'node-next';
    else if (deps.vite) kind = 'node-vite';
    return {
      kind,
      label: kind === 'node-next' ? 'Next.js' : kind === 'node-vite' ? 'Vite' : 'Node.js',
      hasBuild: Boolean(scripts.build),
      hasStart: Boolean(scripts.start),
      hasPreview: Boolean(scripts.preview),
      hasDev: Boolean(scripts.dev)
    };
  } catch {}
  try {
    await access(join(cwd, 'requirements.txt'));
    return { kind: 'python', label: 'Python', hasBuild: false, hasStart: false, hasPreview: false, hasDev: false };
  } catch {}
  return { kind: 'unknown', label: 'Desconocido', hasBuild: false, hasStart: false, hasPreview: false, hasDev: false };
}

export function deploymentPlan(stack, port) {
  const p = String(Number(port));
  if (!/^\d+$/.test(p) || Number(p) < 1024 || Number(p) > 65535) throw new Error('invalid_port');
  if (stack.kind === 'node-vite' && stack.hasPreview) {
    return {
      install: ['npm', 'install'],
      build: stack.hasBuild ? ['npm', 'run', 'build'] : null,
      pm2: { cmd: 'pm2', args: ['start', 'npm', '--name', '__APP__', '--', 'run', 'preview', '--', '--host', '0.0.0.0', '--port', p] }
    };
  }
  if (stack.kind === 'node-next' && stack.hasStart) {
    return {
      install: ['npm', 'install'],
      build: stack.hasBuild ? ['npm', 'run', 'build'] : null,
      pm2: { cmd: 'pm2', args: ['start', 'npm', '--name', '__APP__', '--', 'start', '--', '--hostname', '0.0.0.0', '--port', p] }
    };
  }
  if (stack.kind === 'node' && stack.hasStart) {
    return {
      install: ['npm', 'install'],
      build: stack.hasBuild ? ['npm', 'run', 'build'] : null,
      pm2: { cmd: 'pm2', args: ['start', 'npm', '--name', '__APP__', '--', 'start'] },
      env: { PORT: p, HOST: '0.0.0.0' }
    };
  }
  throw new Error('unsupported_stack');
}

export async function isPortAvailable(port, host = '0.0.0.0') {
  return await new Promise((resolvePromise) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolvePromise(false));
    server.listen(port, host, () => server.close(() => resolvePromise(true)));
  });
}

export async function findAvailablePort(start = 3100, end = 3999) {
  for (let port = start; port <= end; port++) if (await isPortAvailable(port)) return port;
  throw new Error('no_available_port');
}

export async function inspectRepository(repoUrl, reposDir) {
  const url = validateRepositoryUrl(repoUrl);
  const name = normalizeProjectName(projectNameFromRepoUrl(url));
  const target = resolve(reposDir, name);
  const exists = await stat(target).then(s => s.isDirectory()).catch(() => false);
  return { repoUrl: url, name, target, exists };
}

export async function provisionApp({ repoUrl, name, port, reposDir, install = true }) {
  const url = validateRepositoryUrl(repoUrl);
  const projectName = normalizeProjectName(name || projectNameFromRepoUrl(url));
  const target = resolve(reposDir, projectName);
  if (!target.startsWith(resolve(reposDir) + '/')) throw new Error('invalid_project_name');
  await mkdir(reposDir, { recursive: true });
  const exists = await stat(target).then(s => s.isDirectory()).catch(() => false);
  if (!exists) await exec('git', ['clone', '--depth', '1', url, target], { timeout: 120000, maxBuffer: 4_000_000 });
  const stack = await detectStack(target);
  const selectedPort = port ? Number(port) : await findAvailablePort();
  const plan = deploymentPlan(stack, selectedPort);
  if (!install) return { name: projectName, path: target, stack, port: selectedPort, installed: false };
  await exec(plan.install[0], plan.install.slice(1), { cwd: target, timeout: 300000, maxBuffer: 8_000_000 });
  if (plan.build) await exec(plan.build[0], plan.build.slice(1), { cwd: target, timeout: 300000, maxBuffer: 8_000_000 });
  const pm2Args = plan.pm2.args.map(v => v === '__APP__' ? projectName : v);
  const env = { ...process.env, ...(plan.env || {}) };
  await exec(plan.pm2.cmd, pm2Args, { cwd: target, env, timeout: 30000, maxBuffer: 4_000_000 });
  await exec('pm2', ['save'], { timeout: 20000, maxBuffer: 1_000_000 }).catch(() => {});
  return { name: projectName, path: target, stack, port: selectedPort, installed: true, url: `http://0.0.0.0:${selectedPort}` };
}
