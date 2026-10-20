// Repeatable local load check using a private snapshot; never seed/reset main records.
import { once } from 'node:events';
import { fork } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from './http.js';
import { backupDatabase } from './backup.js';
import { practicePasswords } from './practice-blocks.js';

if (process.argv[2] === '--worker') {
  const server = startServer(0, process.argv[3]);
  server.once('listening', () => process.send({ port: server.address().port }));
  process.on('message', message => {
    if (message === 'close') {
      server.close(() => process.disconnect());
      server.closeAllConnections();
    }
  });
} else {
  const folder = await mkdtemp(join(tmpdir(), 'enrollment-load-'));
  let child;
  try {
    const snapshot = join(folder, 'practice.sqlite');
    await backupDatabase(resolve('data/practice-blocks.sqlite'), snapshot);
    child = fork(fileURLToPath(import.meta.url), ['--worker', snapshot], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true });
    const [{ port }] = await Promise.race([
      once(child, 'message'),
      once(child, 'exit').then(([code]) => { throw new Error('Load-test server exited before startup: '+code); })
    ]);
    const base = `http://127.0.0.1:${port}/api`;
    const login = await fetch(base+'/auth/login', { method:'POST', headers:{'content-type':'application/json','x-registrar-request':'1'}, body:JSON.stringify({role:'registrar',password:practicePasswords.registrar}) });
    if (!login.ok) throw new Error('Practice credentials changed. Use the documented fictional fixture; no password was reset.');
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const results = [];
    for (const path of ['/data', '/reports']) {
      const warm = await (await fetch(base+path,{headers:{cookie}})).json();
      if (path === '/data' && warm.students?.length !== 480) throw new Error('Expected the documented 480-student fictional practice fixture.');
      const times = await Promise.all(Array.from({length:50}, async () => {
        const begin = performance.now();
        const response = await fetch(base+path,{headers:{cookie}});
        if (!response.ok) throw new Error('Load request failed: '+response.status);
        await response.json();
        return performance.now()-begin;
      }));
      times.sort((a,b)=>a-b);
      const p95 = times[Math.ceil(times.length*.95)-1];
      results.push({endpoint:'GET '+path,concurrency:50,requests:50,p95ms:Math.round(p95),maxMs:Math.round(times.at(-1)),targetMs:3000,passed:p95<3000});
    }
    console.log(JSON.stringify({scope:'Localhost copy of 480-student fictional fixture; separate server/client processes; warm reads; excludes browser rendering and login load',results},null,2));
    if (results.some(row=>!row.passed)) process.exitCode=1;
  } finally {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      const exited = once(child,'exit');
      if (child.connected) child.send('close'); else child.kill();
      await exited;
    }
    await rm(folder,{recursive:true,force:true});
  }
}
