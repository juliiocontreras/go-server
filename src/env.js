import { readFileSync } from 'node:fs';

export function parseEnv(text) {
  const out = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const index = line.indexOf('=');
    if (index < 0) continue;
    const key = line.slice(0, index).trim();
    let value = line.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

export function loadEnvFile(path = '.env', baseEnv = process.env) {
  try {
    return { ...parseEnv(readFileSync(path, 'utf8')), ...baseEnv };
  } catch (error) {
    if (error?.code === 'ENOENT') return { ...baseEnv };
    throw error;
  }
}
