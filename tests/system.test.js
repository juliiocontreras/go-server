import test from 'node:test';
import assert from 'node:assert/strict';
import { formatBytes, memorySnapshot, cpuSnapshot } from '../src/system.js';

test('formatBytes formats human readable sizes', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(1024 * 1024), '1 MB');
});

test('memorySnapshot returns bounded percentages', () => {
  const snap = memorySnapshot({ totalmem: () => 1000, freemem: () => 250 });
  assert.deepEqual(snap, { total: 1000, free: 250, used: 750, usedPercent: 75 });
});

test('cpuSnapshot averages core load safely', () => {
  const snap = cpuSnapshot({
    cpus: () => [
      { times: { user: 40, nice: 0, sys: 10, idle: 50, irq: 0 } },
      { times: { user: 20, nice: 0, sys: 10, idle: 70, irq: 0 } }
    ],
    loadavg: () => [1.2, 0.8, 0.4]
  });
  assert.equal(snap.cores, 2);
  assert.equal(snap.busyPercent, 40);
  assert.deepEqual(snap.loadAverage, [1.2, 0.8, 0.4]);
});
