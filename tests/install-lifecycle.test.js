import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

test('installer is not registered as the npm install lifecycle hook', () => {
  assert.equal(pkg.scripts.install, undefined);
  assert.equal(pkg.scripts['install:server'], 'bash scripts/install.sh');
});
