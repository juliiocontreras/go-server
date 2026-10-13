import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

async function waitFor(url, attempts = 40) {
  for (let i = 0; i < attempts; i++) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('server_not_ready');
}

test('backup API is authenticated and supports create/list/verify', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'go-server-api-'));
  const reposDir = path.join(root, 'repos');
  const backupsDir = path.join(root, 'backups');
  const port = 22000 + (process.pid % 10000);
  const token = 'test-admin-token';
  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      ADMIN_TOKEN: token,
      REPOS_DIR: reposDir,
      BACKUPS_DIR: backupsDir,
      AUTO_BACKUP: 'false'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const base = `http://127.0.0.1:${port}`;
  try {
    await waitFor(`${base}/api/health`);
    const unauthorized = await fetch(`${base}/api/backups`);
    assert.equal(unauthorized.status, 401);

    const auth = { Authorization: `Bearer ${token}`, 'content-type': 'application/json' };
    const initial = await fetch(`${base}/api/backups`, { headers: auth });
    assert.equal(initial.status, 200);
    assert.deepEqual((await initial.json()).backups, []);

    const createdResponse = await fetch(`${base}/api/backups/create`, { method: 'POST', headers: auth, body: '{}' });
    assert.equal(createdResponse.status, 200);
    const created = await createdResponse.json();
    assert.match(created.backup.id, /^go-server-\d{8}-\d{6}$/);
    assert.equal(created.backup.includeRepoFiles, false);

    const verifyResponse = await fetch(`${base}/api/backups/${created.backup.id}/verify`, { method: 'POST', headers: auth, body: '{}' });
    assert.equal(verifyResponse.status, 200);
    assert.equal((await verifyResponse.json()).verification.ok, true);

    const invalid = await fetch(`${base}/api/backups/not-safe/verify`, { method: 'POST', headers: auth, body: '{}' });
    assert.equal(invalid.status, 400);

    const noPlan = await fetch(`${base}/api/backups/restore/execute`, { method: 'POST', headers: auth, body: '{}' });
    assert.equal(noPlan.status, 400);
  } finally {
    child.kill('SIGTERM');
    await new Promise(resolve => child.once('exit', resolve));
    await rm(root, { recursive: true, force: true });
  }
});
