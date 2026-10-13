import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEnv } from '../src/env.js';

test('parseEnv parses comments, blank lines and quoted values', () => {
  const parsed = parseEnv(`# comment\nPORT=8787\nADMIN_TOKEN="abc 123"\nEMPTY=\n\n`);
  assert.deepEqual(parsed, { PORT: '8787', ADMIN_TOKEN: 'abc 123', EMPTY: '' });
});

test('parseEnv preserves equals signs inside values', () => {
  assert.deepEqual(parseEnv('TOKEN=a=b=c\n'), { TOKEN: 'a=b=c' });
});
