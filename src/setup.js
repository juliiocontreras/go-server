import { randomBytes } from 'node:crypto';

export function validatePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('Port must be an integer between 1 and 65535');
  }
  return port;
}

export function defaultReposDir(env = process.env) {
  return env.HOME ? `${env.HOME}/repos` : './repos';
}

export function createAdminToken(bytes = 24) {
  return randomBytes(bytes).toString('hex');
}

export function buildEnv({ port, host, adminToken, reposDir, autoUpdate = true, syncRepos = true }) {
  return [
    `PORT=${validatePort(port)}`,
    `HOST=${host || '0.0.0.0'}`,
    `ADMIN_TOKEN=${adminToken}`,
    `REPOS_DIR=${reposDir}`,
    `AUTO_UPDATE=${autoUpdate}`,
    `SYNC_REPOS=${syncRepos}`,
    ''
  ].join('\n');
}

export function maskToken(token) {
  if (!token || token.length <= 4) return '••••';
  return `${'•'.repeat(8)}${token.slice(-4)}`;
}
