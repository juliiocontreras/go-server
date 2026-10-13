#!/usr/bin/env node
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildEnv, createAdminToken, defaultReposDir, validatePort } from '../src/setup.js';
import { parseEnv } from '../src/env.js';

const root = resolve(new URL('..', import.meta.url).pathname);
const envPath = resolve(root, '.env');
const rl = createInterface({ input, output });

async function currentEnv() {
  try { return parseEnv(await readFile(envPath, 'utf8')); } catch { return {}; }
}

function yes(value) {
  return ['s', 'si', 'sí', 'y', 'yes'].includes(String(value).trim().toLowerCase());
}

const existing = await currentEnv();
const defaultPort = existing.PORT || '8787';
const defaultDir = existing.REPOS_DIR || defaultReposDir();
const generatedToken = existing.ADMIN_TOKEN || createAdminToken();

console.log('\n🚀 Go Server — configuración inicial\n');
console.log('Puedes presionar Enter para aceptar cada valor recomendado.\n');

let port;
while (!port) {
  const raw = await rl.question(`Puerto [${defaultPort}]: `);
  try { port = validatePort(raw || defaultPort); } catch { console.log('⚠️  Usa un puerto entre 1 y 65535.'); }
}

const reposDir = (await rl.question(`Carpeta para repositorios [${defaultDir}]: `)).trim() || defaultDir;
const keepToken = existing.ADMIN_TOKEN
  ? yes((await rl.question('Ya existe una credencial. ¿Conservarla? [S/n]: ')).trim() || 's')
  : true;
const adminToken = keepToken ? generatedToken : createAdminToken();

await mkdir(reposDir, { recursive: true });
await writeFile(envPath, buildEnv({ port, host: '0.0.0.0', adminToken, reposDir }), { mode: 0o600 });

console.log('\n✅ Configuración lista.');
console.log(`📁 Repositorios: ${reposDir}`);
console.log(`🌐 Panel local: http://127.0.0.1:${port}`);
console.log(`🔐 ADMIN_TOKEN: ${adminToken}`);
console.log('\nGuarda ese token en un lugar seguro. Lo necesitarás para administrar Go Server.\n');
rl.close();
