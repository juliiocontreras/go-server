import test from 'node:test'; import assert from 'node:assert/strict'; import {getConfig} from '../src/config.js';
test('uses mobile-safe defaults',()=>{const c=getConfig({HOME:'/home/u'}); assert.equal(c.port,8787); assert.equal(c.host,'0.0.0.0'); assert.equal(c.reposDir,'/home/u/repos')});
test('honors env config',()=>{const c=getConfig({PORT:'9999',HOST:'127.0.0.1',ADMIN_TOKEN:'x',REPOS_DIR:'/r'}); assert.deepEqual(c,{port:9999,host:'127.0.0.1',adminToken:'x',reposDir:'/r'})});
