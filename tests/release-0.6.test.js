import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');

test('release version is 0.6.0 without npm install lifecycle regression', () => {
  assert.equal(pkg.version, '0.6.0');
  assert.equal(pkg.scripts.install, undefined);
  assert.equal(pkg.scripts['install:server'], 'bash scripts/install.sh');
});

test('mobile dashboard exposes backup and migration controls', () => {
  for (const id of ['backupList', 'createBackup', 'reloadBackups', 'backupFiles', 'restorePreview', 'confirmRestore']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), id);
  }
  assert.match(html, /Backup y migraci[oó]n/i);
  assert.match(app, /\/api\/backups/);
  assert.match(app, /restore\/plan/);
  assert.match(app, /restore\/execute/);
});
