export function getConfig(env = process.env) {
  const home = env.HOME || '.';
  return {
    port: Number(env.PORT || 8787),
    host: env.HOST || '0.0.0.0',
    adminToken: env.ADMIN_TOKEN || '',
    reposDir: env.REPOS_DIR || `${home}/repos`,
    backupsDir: env.BACKUPS_DIR || `${home}/.go-server/backups`,
    autoBackup: env.AUTO_BACKUP !== 'false'
  };
}
