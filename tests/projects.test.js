import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { discoverProjects, isSafeProcessName } from '../src/projects.js';

test('discoverProjects lists directories and detects git repos', async () => {
  const root = await mkdtemp(join(tmpdir(), 'go-server-projects-'));
  await mkdir(join(root, 'alpha', '.git'), { recursive: true });
  await mkdir(join(root, 'beta'), { recursive: true });
  await writeFile(join(root, 'ignore.txt'), 'x');
  const projects = await discoverProjects(root);
  assert.deepEqual(projects.map(p => ({ name: p.name, isGit: p.isGit })), [
    { name: 'alpha', isGit: true },
    { name: 'beta', isGit: false }
  ]);
});

test('isSafeProcessName rejects shell-like input', () => {
  assert.equal(isSafeProcessName('go-server'), true);
  assert.equal(isSafeProcessName('jobia_app-2'), true);
  assert.equal(isSafeProcessName('../etc'), false);
  assert.equal(isSafeProcessName('x;rm -rf /'), false);
});
