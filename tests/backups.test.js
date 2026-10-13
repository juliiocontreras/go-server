import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, appendFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  isSafeBackupId,
  isSecretPath,
  sha256File,
  createManifest,
  applyRetention,
  sanitizeGitRemote
} from '../src/backups.js';

test('backup ids only accept Go Server timestamp format', () => {
  assert.equal(isSafeBackupId('go-server-20261013-142530'), true);
  assert.equal(isSafeBackupId('../go-server-20261013-142530'), false);
  assert.equal(isSafeBackupId('go-server-2026-10-13'), false);
});

test('secret paths are excluded by default', () => {
  const secret = ['.env', '.env.production', 'server.pem', 'private.key', '.ssh/id_ed25519', 'config/credentials.json', 'token.json', '.npmrc'];
  const safe = ['README.md', 'src/server.js', 'public/app.js', 'config/settings.json'];
  for (const value of secret) assert.equal(isSecretPath(value), true, value);
  for (const value of safe) assert.equal(isSecretPath(value), false, value);
});

test('git remotes never persist embedded HTTPS credentials', () => {
  assert.equal(sanitizeGitRemote('https://ghp_secret@github.com/user/repo.git'), 'https://github.com/user/repo.git');
  assert.equal(sanitizeGitRemote('https://user:secret@github.com/user/repo.git?token=oops'), 'https://github.com/user/repo.git');
  assert.equal(sanitizeGitRemote('git@github.com:user/repo.git'), 'git@github.com:user/repo.git');
});

test('sha256 changes when archive bytes change', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'go-server-backup-test-'));
  const file = path.join(dir, 'archive.tar.gz');
  try {
    await writeFile(file, 'alpha');
    const before = await sha256File(file);
    await appendFile(file, 'beta');
    const after = await sha256File(file);
    assert.match(before, /^[a-f0-9]{64}$/);
    assert.notEqual(before, after);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('manifest is portable and records repo metadata without source absolute paths', () => {
  const manifest = createManifest({
    version: '0.6.0',
    platform: 'android',
    reposDir: '/data/data/com.termux/files/home/repos',
    includeRepoFiles: false,
    repositories: [{ name: 'rutie', branch: 'main', commit: 'abc123', remote: 'https://secret@github.com/juliiocontreras/rutie.git' }],
    createdAt: '2026-10-13T20:30:00.000Z'
  });
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.includeRepoFiles, false);
  assert.equal(manifest.repositories[0].name, 'rutie');
  assert.equal(manifest.repositories[0].remote, 'https://github.com/juliiocontreras/rutie.git');
  assert.equal(JSON.stringify(manifest).includes('/data/data/com.termux/files/home/repos'), false);
  assert.ok(manifest.excludedSecrets.includes('.env'));
});

test('retention keeps at most 7 daily and 4 older weekly snapshots', () => {
  const entries = [];
  for (let i = 0; i < 20; i++) {
    const date = new Date(Date.UTC(2026, 9, 20 - i, 12, 0, 0));
    entries.push({ id: `go-server-${date.toISOString().slice(0,10).replaceAll('-','')}-120000`, createdAt: date.toISOString() });
  }
  const { keep, remove } = applyRetention(entries, { daily: 7, weekly: 4 });
  assert.ok(keep.length <= 11);
  assert.ok(remove.length >= 9);
  assert.equal(keep[0].id, entries[0].id);
  assert.equal(new Set([...keep, ...remove].map(x => x.id)).size, entries.length);
});
