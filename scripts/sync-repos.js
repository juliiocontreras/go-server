import { loadEnvFile } from '../src/env.js';
import { readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const exec=promisify(execFile); const env=loadEnvFile(); const root=env.REPOS_DIR || `${env.HOME || '.'}/repos`;
for (const ent of await readdir(root,{withFileTypes:true}).catch(()=>[])) {
  if(!ent.isDirectory()) continue; const cwd=`${root}/${ent.name}`;
  try { await exec('git',['rev-parse','--is-inside-work-tree'],{cwd}); await exec('git',['add','-A'],{cwd});
    const s=(await exec('git',['status','--porcelain'],{cwd})).stdout.trim();
    if(s){ await exec('git',['commit','-m',`backup: auto sync ${new Date().toISOString()}`],{cwd}); }
    await exec('git',['push'],{cwd,timeout:60000}); console.log(`synced ${ent.name}`);
  } catch(e){ console.error(`skip ${ent.name}: ${e.message}`); }
}
