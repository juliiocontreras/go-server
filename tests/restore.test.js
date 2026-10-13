import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateArchiveEntries,
  registerRestorePlan,
  consumeRestorePlan
} from '../src/backups.js';

test('archive validation rejects traversal and absolute paths', () => {
  for (const name of ['../etc/passwd', 'safe/../../escape', '/absolute/file', 'C:/Windows/system.ini', 'C:\\Windows\\system.ini']) {
    assert.throws(() => validateArchiveEntries([name]), /invalid_archive/);
  }
  assert.doesNotThrow(() => validateArchiveEntries(['./manifest.json', './config/runtime.json', './repos/rutie/src/app.js']));
});

test('archive validation rejects links and escaping link targets', () => {
  assert.throws(() => validateArchiveEntries([{ name: './repos/link', type: 'symlink', linkname: '/etc' }]), /invalid_archive/);
  assert.throws(() => validateArchiveEntries([{ name: './repos/link', type: 'symlink', linkname: '../../outside' }]), /invalid_archive/);
});

test('restore plan tokens are single-use and expire', () => {
  const now = Date.parse('2026-10-13T21:00:00Z');
  const token = registerRestorePlan({ backupId: 'go-server-20261013-210000', sha256: 'a'.repeat(64), operations: [] }, { now, ttlMs: 600_000 });
  const plan = consumeRestorePlan(token, { now: now + 1_000 });
  assert.equal(plan.backupId, 'go-server-20261013-210000');
  assert.throws(() => consumeRestorePlan(token, { now: now + 2_000 }), /restore_plan_invalid/);

  const expired = registerRestorePlan({ backupId: 'go-server-20261013-210000', sha256: 'b'.repeat(64), operations: [] }, { now, ttlMs: 1_000 });
  assert.throws(() => consumeRestorePlan(expired, { now: now + 1_001 }), /restore_plan_expired/);
});
