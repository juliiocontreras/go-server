import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

export function formatBytes(bytes = 0) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  const rounded = value >= 10 || Number.isInteger(value) ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[i]}`;
}

export function memorySnapshot(source = os) {
  const total = Number(source.totalmem()) || 0;
  const free = Number(source.freemem()) || 0;
  const used = Math.max(0, total - free);
  const usedPercent = total ? Math.round((used / total) * 100) : 0;
  return { total, free, used, usedPercent };
}

export function cpuSnapshot(source = os) {
  const cpus = source.cpus() || [];
  let total = 0;
  let idle = 0;
  for (const cpu of cpus) {
    const times = cpu.times || {};
    const coreTotal = Object.values(times).reduce((sum, value) => sum + (Number(value) || 0), 0);
    total += coreTotal;
    idle += Number(times.idle) || 0;
  }
  const busyPercent = total ? Math.round(((total - idle) / total) * 100) : 0;
  return { cores: cpus.length, busyPercent, loadAverage: (source.loadavg?.() || [0,0,0]).map(n => Math.round(n * 100) / 100) };
}

export async function diskSnapshot(path = '.') {
  try {
    const { stdout } = await exec('df', ['-Pk', path], { timeout: 5000 });
    const lines = stdout.trim().split(/\r?\n/);
    const parts = lines.at(-1).trim().split(/\s+/);
    const total = Number(parts[1]) * 1024;
    const used = Number(parts[2]) * 1024;
    const free = Number(parts[3]) * 1024;
    return { total, used, free, usedPercent: total ? Math.round((used / total) * 100) : 0 };
  } catch {
    return { total: 0, used: 0, free: 0, usedPercent: 0 };
  }
}

export async function systemSnapshot(reposDir = '.') {
  const memory = memorySnapshot();
  const cpu = cpuSnapshot();
  const disk = await diskSnapshot(reposDir);
  return {
    hostname: os.hostname(),
    platform: process.platform,
    arch: process.arch,
    node: process.version,
    uptime: Math.round(os.uptime()),
    cpu,
    memory: { ...memory, totalLabel: formatBytes(memory.total), usedLabel: formatBytes(memory.used) },
    disk: { ...disk, totalLabel: formatBytes(disk.total), usedLabel: formatBytes(disk.used), freeLabel: formatBytes(disk.free) }
  };
}
