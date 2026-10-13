import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateRepositoryUrl, projectNameFromRepoUrl, normalizeProjectName, detectStack, deploymentPlan } from '../src/apps.js';

test('validateRepositoryUrl accepts canonical GitHub HTTPS repositories', () => {
  assert.equal(validateRepositoryUrl('https://github.com/juliiocontreras/rutie.git'), 'https://github.com/juliiocontreras/rutie.git');
  assert.equal(validateRepositoryUrl('https://github.com/juliiocontreras/rutie'), 'https://github.com/juliiocontreras/rutie.git');
});

test('validateRepositoryUrl rejects credentials, non GitHub hosts and extra paths', () => {
  assert.throws(() => validateRepositoryUrl('https://token@github.com/a/b.git'), /invalid_repository_url/);
  assert.throws(() => validateRepositoryUrl('https://example.com/a/b.git'), /invalid_repository_url/);
  assert.throws(() => validateRepositoryUrl('https://github.com/a/b/issues'), /invalid_repository_url/);
});

test('projectNameFromRepoUrl and normalizeProjectName produce safe names', () => {
  assert.equal(projectNameFromRepoUrl('https://github.com/acme/My-App.git'), 'My-App');
  assert.equal(normalizeProjectName(' My App 2026 '), 'my-app-2026');
  assert.throws(() => normalizeProjectName('../oops'), /invalid_project_name/);
});

test('detectStack identifies Vite and its scripts', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'go-server-vite-'));
  await writeFile(join(dir, 'package.json'), JSON.stringify({
    scripts: { dev: 'vite', build: 'vite build', preview: 'vite preview' },
    dependencies: { vite: '^7.0.0' }
  }));
  const stack = await detectStack(dir);
  assert.equal(stack.kind, 'node-vite');
  assert.equal(stack.hasBuild, true);
  assert.equal(stack.hasPreview, true);
});

test('detectStack identifies Next.js and generic Node', async () => {
  const nextDir = await mkdtemp(join(tmpdir(), 'go-server-next-'));
  await writeFile(join(nextDir, 'package.json'), JSON.stringify({ scripts:{build:'next build',start:'next start'}, dependencies:{next:'16.0.0'} }));
  assert.equal((await detectStack(nextDir)).kind, 'node-next');

  const nodeDir = await mkdtemp(join(tmpdir(), 'go-server-node-'));
  await writeFile(join(nodeDir, 'package.json'), JSON.stringify({ scripts:{start:'node server.js'} }));
  assert.equal((await detectStack(nodeDir)).kind, 'node');
});

test('deploymentPlan returns constrained commands for supported Node stacks', () => {
  const vite = deploymentPlan({kind:'node-vite',hasBuild:true,hasPreview:true}, 3210);
  assert.deepEqual(vite.install, ['npm','install']);
  assert.deepEqual(vite.build, ['npm','run','build']);
  assert.deepEqual(vite.pm2.args.slice(0,4), ['start','npm','--name','__APP__']);
  assert.ok(vite.pm2.args.includes('3210'));

  const next = deploymentPlan({kind:'node-next',hasBuild:true,hasStart:true}, 3211);
  assert.deepEqual(next.build, ['npm','run','build']);
  assert.ok(next.pm2.args.includes('3211'));
});
