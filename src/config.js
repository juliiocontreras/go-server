export function getConfig(env = process.env) {
  return {
    port: Number(env.PORT || 8787),
    host: env.HOST || '0.0.0.0',
    adminToken: env.ADMIN_TOKEN || '',
    reposDir: env.REPOS_DIR || `${env.HOME || '.'}/repos`
  };
}
