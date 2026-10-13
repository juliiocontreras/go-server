import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  cp,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile
} from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const BACKUP_ID = /^go-server-\d{8}-\d{6}$/;
const PROJECT_NAME = /^[A-Za-z0-9._-]+$/;
const RESTORE_PLAN_TTL = 600_000;
const SAFE_RUNTIME_KEYS = ['PORT', 'HOST', 'AUTO_UPDATE', 'SYNC_REPOS', 'AUTO_BACKUP'];
const restorePlans = new Map();
export const EXCLUDED_SECRETS = ['.env', '.env.*', '*.pem', '*.key', '.ssh', 'credentials.json', 'token.json', '.npmrc'];

export function isSafeBackupId(value) {
  return typeof value === 'string' && BACKUP_ID.test(value);
}

export function isSecretPath(value = '') {
  const normalized = String(value).replaceAll('\\', '/').replace(/^\.\//, '');
  const parts = normalized.split('/').filter(Boolean);
  const file = (parts.at(-1) || '').toLowerCase();
  const lowerParts = parts.map(part => part.toLowerCase());
  if (lowerParts.includes('.ssh')) return true;
  if (file === '.env' || file.startsWith('.env.')) return true;
  if (file.endsWith('.pem') || file.endsWith('.key')) return true;
  if (file === '.npmrc' || file === 'credentials.json' || file === 'token.json') return true;
  return false;
}

export async function sha256File(file) {
  const hash = createHash('sha256');
  await new Promise((resolve, reject) => {
    const stream = createReadStream(file);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

export function createManifest({ version, platform, includeRepoFiles = false, repositories = [], createdAt = new Date().toISOString() }) {
  return {
    formatVersion: 1,
    createdAt,
    goServerVersion: version || 'unknown',
    sourcePlatform: platform || process.platform,
    includeRepoFiles: Boolean(includeRepoFiles),
    excludedSecrets: [...EXCLUDED_SECRETS],
    repositories: repositories.map(repo => ({
      name: repo.name,
      branch: repo.branch || null,
      commit: repo.commit || null,
      remote: repo.remote || null
    }))
  };
}

function isoWeekKey(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'invalid';
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / 86400000) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function applyRetention(entries = [], { daily = 7, weekly = 4 } = {}) {
  const sorted = [...entries].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const keepIds = new Set();
  const dailyKeys = new Set();
  for (const entry of sorted) {
    if (dailyKeys.size >= daily) break;
    const key = String(entry.createdAt || '').slice(0, 10);
    if (!key || dailyKeys.has(key)) continue;
    dailyKeys.add(key);
    keepIds.add(entry.id);
  }
  const weeklyKeys = new Set();
  for (const entry of sorted) {
    if (keepIds.has(entry.id)) continue;
    if (weeklyKeys.size >= weekly) break;
    const key = isoWeekKey(entry.createdAt);
    if (key === 'invalid' || weeklyKeys.has(key)) continue;
    weeklyKeys.add(key);
    keepIds.add(entry.id);
  }
  if (sorted[0]) keepIds.add(sorted[0].id);
  return {
    keep: sorted.filter(entry => keepIds.has(entry.id)),
    remove: sorted.filter(entry => !keepIds.has(entry.id))
  };
}

export function backupRoot(env = process.env) {
  return env.BACKUPS_DIR || path.join(env.HOME || '.', '.go-server', 'backups');
}

function backupId(date = new Date()) {
  const d = date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, '');
  return `go-server-${d.slice(0, 8)}-${d.slice(9, 15)}`;
}

function parseSimpleEnv(text = '') {
  const result = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 1) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
  }
  return result;
}

async function readSafeRuntimeConfig(rootDir) {
  try {
    const env = parseSimpleEnv(await readFile(path.join(rootDir, '.env'), 'utf8'));
    return Object.fromEntries(SAFE_RUNTIME_KEYS.filter(key => key in env).map(key => [key, env[key]]));
  } catch {
    return {};
  }
}

async function git(args, cwd) {
  try {
    const { stdout } = await exec('git', args, { cwd, timeout: 10000 });
    return stdout.trim();
  } catch {
    return null;
  }
}

export async function collectRepositoryDescriptors(reposDir) {
  const entries = await readdir(reposDir, { withFileTypes: true }).catch(() => []);
  const repos = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const cwd = path.join(reposDir, entry.name);
    if (!(await git(['rev-parse', '--is-inside-work-tree'], cwd))) continue;
    repos.push({
      name: entry.name,
      branch: await git(['branch', '--show-current'], cwd),
      commit: await git(['rev-parse', '--short=12', 'HEAD'], cwd),
      remote: await git(['remote', 'get-url', 'origin'], cwd)
    });
  }
  return repos;
}

async function copyPortableTree(source, target) {
  await cp(source, target, {
    recursive: true,
    dereference: false,
    errorOnExist: false,
    force: true,
    filter: src => {
      const rel = path.relative(source, src).replaceAll('\\', '/');
      if (!rel) return true;
      if (rel.split('/').includes('.git')) return false;
      if (rel.split('/').includes('node_modules')) return false;
      return !isSecretPath(rel);
    }
  });
}

async function readPackageVersion(rootDir) {
  try {
    const pkg = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

export async function listBackups({ backupsDir = backupRoot() } = {}) {
  const files = await readdir(backupsDir).catch(() => []);
  const items = [];
  for (const file of files.filter(name => name.endsWith('.json') && name.startsWith('go-server-'))) {
    try {
      const meta = JSON.parse(await readFile(path.join(backupsDir, file), 'utf8'));
      if (isSafeBackupId(meta.id)) items.push(meta);
    } catch {}
  }
  return items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

export async function verifyBackup(id, { backupsDir = backupRoot() } = {}) {
  if (!isSafeBackupId(id)) throw new Error('invalid_backup_id');
  const metaPath = path.join(backupsDir, `${id}.json`);
  const archivePath = path.join(backupsDir, `${id}.tar.gz`);
  const meta = JSON.parse(await readFile(metaPath, 'utf8'));
  const actual = await sha256File(archivePath);
  return { ok: actual === meta.sha256, expected: meta.sha256, actual, id, meta };
}

async function deleteBackupArtifacts(entry, backupsDir) {
  if (!isSafeBackupId(entry.id)) return;
  await Promise.all([
    rm(path.join(backupsDir, `${entry.id}.tar.gz`), { force: true }),
    rm(path.join(backupsDir, `${entry.id}.sha256`), { force: true }),
    rm(path.join(backupsDir, `${entry.id}.json`), { force: true })
  ]);
}

export async function createBackup({
  rootDir = process.cwd(),
  reposDir = path.join(process.env.HOME || '.', 'repos'),
  backupsDir = backupRoot(),
  includeRepoFiles = false,
  repositories,
  createdAt = new Date()
} = {}) {
  await mkdir(backupsDir, { recursive: true });
  const id = backupId(createdAt);
  const staging = await mkdtemp(path.join(backupsDir, '.staging-'));
  const tempArchive = path.join(backupsDir, `.${id}-${randomUUID()}.tar.gz`);
  const archivePath = path.join(backupsDir, `${id}.tar.gz`);
  try {
    const repoList = repositories || await collectRepositoryDescriptors(reposDir);
    const manifest = createManifest({
      version: await readPackageVersion(rootDir),
      platform: process.platform,
      includeRepoFiles,
      repositories: repoList,
      createdAt: createdAt.toISOString()
    });
    await writeFile(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
    await mkdir(path.join(staging, 'config'), { recursive: true });
    await writeFile(path.join(staging, 'config', 'runtime.json'), `${JSON.stringify(await readSafeRuntimeConfig(rootDir), null, 2)}\n`, { mode: 0o600 });
    for (const name of ['package.json', '.env.example']) {
      const source = path.join(rootDir, name);
      try { await access(source); await cp(source, path.join(staging, 'config', name)); } catch {}
    }
    if (includeRepoFiles) {
      const targetRoot = path.join(staging, 'repos');
      await mkdir(targetRoot, { recursive: true });
      for (const repo of repoList) {
        const source = path.join(reposDir, repo.name);
        try { await access(source); await copyPortableTree(source, path.join(targetRoot, repo.name)); } catch {}
      }
    }
    await exec('tar', ['-czf', tempArchive, '-C', staging, '.'], { timeout: 120000 });
    await rename(tempArchive, archivePath);
    const sha256 = await sha256File(archivePath);
    const info = await stat(archivePath);
    const meta = { id, createdAt: manifest.createdAt, sha256, size: info.size, includeRepoFiles: manifest.includeRepoFiles, repositoryCount: manifest.repositories.length };
    await writeFile(path.join(backupsDir, `${id}.sha256`), `${sha256}  ${id}.tar.gz\n`, { mode: 0o600 });
    await writeFile(path.join(backupsDir, `${id}.json`), `${JSON.stringify(meta, null, 2)}\n`, { mode: 0o600 });
    const retention = applyRetention(await listBackups({ backupsDir }));
    for (const entry of retention.remove) await deleteBackupArtifacts(entry, backupsDir);
    return meta;
  } finally {
    await rm(staging, { recursive: true, force: true }).catch(() => {});
    await rm(tempArchive, { force: true }).catch(() => {});
  }
}

export function validateArchiveEntries(entries = []) {
  for (const raw of entries) {
    const entry = typeof raw === 'string' ? { name: raw } : raw || {};
    const original = String(entry.name || '').replaceAll('\\', '/');
    const name = original.replace(/^(\.\/)+/, '');
    if (!name) continue;
    if (name.startsWith('/') || /^[A-Za-z]:\//.test(name)) throw new Error('invalid_archive');
    const parts = name.split('/').filter(Boolean);
    if (parts.some(part => part === '..')) throw new Error('invalid_archive');
    const type = String(entry.type || '').toLowerCase();
    if (type.includes('link') || type.includes('symlink')) throw new Error('invalid_archive');
    if (entry.linkname) {
      const target = String(entry.linkname).replaceAll('\\', '/');
      if (target.startsWith('/') || /^[A-Za-z]:\//.test(target) || target.split('/').includes('..')) throw new Error('invalid_archive');
    }
  }
  return true;
}

export function registerRestorePlan(plan, { now = Date.now(), ttlMs = RESTORE_PLAN_TTL } = {}) {
  const token = randomUUID();
  restorePlans.set(token, { plan: structuredClone(plan), expiresAt: Number(now) + Number(ttlMs) });
  return token;
}

export function consumeRestorePlan(token, { now = Date.now() } = {}) {
  const stored = restorePlans.get(token);
  if (!stored) throw new Error('restore_plan_invalid');
  restorePlans.delete(token);
  if (Number(now) > stored.expiresAt) throw new Error('restore_plan_expired');
  return stored.plan;
}

async function archiveEntries(archivePath) {
  const { stdout } = await exec('tar', ['-tzf', archivePath], { timeout: 30000, maxBuffer: 4_000_000 });
  const entries = stdout.split(/\r?\n/).filter(Boolean);
  validateArchiveEntries(entries);
  return entries;
}

async function assertNoSymlinks(root) {
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const info = await lstat(full);
      if (info.isSymbolicLink()) throw new Error('invalid_archive');
      if (info.isDirectory()) await walk(full);
    }
  }
  await walk(root);
}

async function extractValidatedArchive(archivePath, backupsDir) {
  await archiveEntries(archivePath);
  const stagingRoot = path.join(path.dirname(backupsDir), 'restore-staging');
  await mkdir(stagingRoot, { recursive: true });
  const staging = await mkdtemp(path.join(stagingRoot, 'restore-'));
  try {
    await exec('tar', ['-xzf', archivePath, '-C', staging, '--no-same-owner', '--no-same-permissions'], { timeout: 120000, maxBuffer: 4_000_000 });
    await assertNoSymlinks(staging);
    return staging;
  } catch (error) {
    await rm(staging, { recursive: true, force: true });
    throw error;
  }
}

function safeProjectDestination(reposDir, name) {
  if (!PROJECT_NAME.test(String(name || ''))) throw new Error('invalid_archive');
  const root = path.resolve(reposDir);
  const target = path.resolve(root, name);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('invalid_archive');
  return target;
}

async function exists(value) {
  try { await access(value); return true; } catch { return false; }
}

export async function planRestore(id, {
  backupsDir = backupRoot(),
  reposDir = path.join(process.env.HOME || '.', 'repos'),
  rootDir = process.cwd(),
  now = Date.now()
} = {}) {
  if (!isSafeBackupId(id)) throw new Error('invalid_backup_id');
  const verified = await verifyBackup(id, { backupsDir });
  if (!verified.ok) throw new Error('backup_checksum_mismatch');
  const archivePath = path.join(backupsDir, `${id}.tar.gz`);
  const staging = await extractValidatedArchive(archivePath, backupsDir);
  try {
    const manifest = JSON.parse(await readFile(path.join(staging, 'manifest.json'), 'utf8'));
    if (manifest.formatVersion !== 1 || !Array.isArray(manifest.repositories)) throw new Error('unsupported_backup_format');
    const operations = [];
    if (await exists(path.join(staging, 'config', 'runtime.json'))) {
      operations.push({ type: 'restore-runtime-config', action: 'merge-safe-values', target: '.env' });
    }
    for (const repo of manifest.repositories) {
      const target = safeProjectDestination(reposDir, repo.name);
      if (await exists(target)) {
        operations.push({ type: 'repository', name: repo.name, action: 'skip-existing', target });
      } else if (repo.remote) {
        operations.push({ type: 'repository', name: repo.name, action: 'clone', remote: repo.remote, branch: repo.branch || null, target });
      } else if (manifest.includeRepoFiles && await exists(path.join(staging, 'repos', repo.name))) {
        operations.push({ type: 'repository', name: repo.name, action: 'copy-portable-files', target });
      } else {
        operations.push({ type: 'repository', name: repo.name, action: 'skip-unavailable', target });
      }
    }
    const plan = { backupId: id, sha256: verified.actual, operations, backupsDir, reposDir, rootDir };
    const planToken = registerRestorePlan(plan, { now });
    return {
      ok: true,
      backupId: id,
      planToken,
      expiresInSeconds: RESTORE_PLAN_TTL / 1000,
      operations,
      warnings: ['Los secretos no forman parte del backup y no se restaurarán.', 'Los repositorios existentes no se sobrescribirán.']
    };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

async function writeSafetyConfig(backupsDir, rootDir) {
  const safe = await readSafeRuntimeConfig(rootDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(backupsDir, `pre-restore-config-${stamp}.json`);
  await writeFile(file, `${JSON.stringify(safe, null, 2)}\n`, { mode: 0o600 });
  return file;
}

async function mergeRuntimeConfig(rootDir, runtime) {
  const envPath = path.join(rootDir, '.env');
  let current = {};
  try { current = parseSimpleEnv(await readFile(envPath, 'utf8')); } catch {}
  for (const key of SAFE_RUNTIME_KEYS) if (key in runtime) current[key] = String(runtime[key]);
  const preferred = ['PORT', 'HOST', 'ADMIN_TOKEN', 'REPOS_DIR', 'AUTO_UPDATE', 'SYNC_REPOS', 'AUTO_BACKUP'];
  const keys = [...new Set([...preferred.filter(key => key in current), ...Object.keys(current).sort()])];
  const text = `${keys.map(key => `${key}=${current[key]}`).join('\n')}\n`;
  await writeFile(envPath, text, { mode: 0o600 });
}

export async function executeRestore(planToken, { now = Date.now() } = {}) {
  const plan = consumeRestorePlan(planToken, { now });
  const verified = await verifyBackup(plan.backupId, { backupsDir: plan.backupsDir });
  if (!verified.ok || verified.actual !== plan.sha256) throw new Error('backup_checksum_mismatch');
  const archivePath = path.join(plan.backupsDir, `${plan.backupId}.tar.gz`);
  const staging = await extractValidatedArchive(archivePath, plan.backupsDir);
  const results = [];
  try {
    const manifest = JSON.parse(await readFile(path.join(staging, 'manifest.json'), 'utf8'));
    if (manifest.formatVersion !== 1) throw new Error('unsupported_backup_format');
    const safetyConfig = await writeSafetyConfig(plan.backupsDir, plan.rootDir);
    for (const operation of plan.operations) {
      if (operation.action === 'merge-safe-values') {
        const runtime = JSON.parse(await readFile(path.join(staging, 'config', 'runtime.json'), 'utf8'));
        await mergeRuntimeConfig(plan.rootDir, runtime);
        results.push({ ...operation, status: 'restored' });
        continue;
      }
      if (operation.action === 'clone') {
        if (await exists(operation.target)) {
          results.push({ ...operation, status: 'skipped-existing' });
          continue;
        }
        await mkdir(path.dirname(operation.target), { recursive: true });
        const args = ['clone'];
        if (operation.branch) args.push('--branch', operation.branch, '--single-branch');
        args.push(operation.remote, operation.target);
        await exec('git', args, { timeout: 180000, maxBuffer: 4_000_000 });
        results.push({ ...operation, status: 'cloned' });
        continue;
      }
      if (operation.action === 'copy-portable-files') {
        if (await exists(operation.target)) {
          results.push({ ...operation, status: 'skipped-existing' });
          continue;
        }
        const source = path.join(staging, 'repos', operation.name);
        await cp(source, operation.target, { recursive: true, errorOnExist: true, force: false });
        results.push({ ...operation, status: 'copied' });
        continue;
      }
      results.push({ ...operation, status: 'skipped' });
    }
    return { ok: true, backupId: plan.backupId, safetyConfig, results };
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
