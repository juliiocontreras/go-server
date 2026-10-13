import { getConfig } from '../src/config.js';
import { loadEnvFile } from '../src/env.js';
import { createBackup } from '../src/backups.js';

const cfg = getConfig(loadEnvFile());
if (!cfg.autoBackup) {
  console.log('auto-backup disabled');
  process.exit(0);
}

const backup = await createBackup({
  rootDir: process.cwd(),
  reposDir: cfg.reposDir,
  backupsDir: cfg.backupsDir,
  includeRepoFiles: false
});
console.log(`backup:${backup.id}:${backup.sha256}`);
