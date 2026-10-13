import test from 'node:test';
import assert from 'node:assert/strict';
import { buildEnv, validatePort, defaultReposDir, maskToken } from '../src/setup.js';

test('validatePort accepts valid TCP ports', () => {
  assert.equal(validatePort('8787'), 8787);
  assert.equal(validatePort(443), 443);
});

test('validatePort rejects invalid values', () => {
  assert.throws(() => validatePort('0'), /port/i);
  assert.throws(() => validatePort('70000'), /port/i);
  assert.throws(() => validatePort('abc'), /port/i);
});

test('defaultReposDir uses HOME and a portable fallback', () => {
  assert.equal(defaultReposDir({ HOME: '/home/juls' }), '/home/juls/repos');
  assert.equal(defaultReposDir({}), './repos');
});

test('buildEnv serializes a ready-to-run configuration', () => {
  const env = buildEnv({ port: 8787, host: '0.0.0.0', adminToken: 'abc123', reposDir: '/srv/repos' });
  assert.equal(env, 'PORT=8787\nHOST=0.0.0.0\nADMIN_TOKEN=abc123\nREPOS_DIR=/srv/repos\nAUTO_UPDATE=true\nSYNC_REPOS=true\n');
});

test('maskToken only exposes the last four characters', () => {
  assert.equal(maskToken('abcdefghijkl'), '••••••••ijkl');
  assert.equal(maskToken('abc'), '••••');
});
