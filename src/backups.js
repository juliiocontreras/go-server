import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import {
  access,
  cp,
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
  for (const file of files.filter(name => name.endsWith('.json'))) {
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
  return { ok: actual === meta.sha256, expected: meta.sha256, actual, id };
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
