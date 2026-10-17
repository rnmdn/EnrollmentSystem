import { resolve, dirname, basename } from 'node:path';
import { access } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openStore } from './db.js';
import { backupDatabase } from './backup.js';
import { plpCurriculum2022 } from '../curriculum/plp-2022.js';

export async function loadSuppliedCurriculum(path) {
  try {
    await access(path);
    await backupDatabase(path,resolve(dirname(path),'backups',basename(path,'.sqlite')+'-before-curriculum-'+Date.now()+'.sqlite'));
  } catch (error) { if (error.code!=='ENOENT') throw error; }
  const store=openStore(path);
  try { return store.importCurriculum(plpCurriculum2022,{role:'registrar',id:'registrar'}); }
  finally { store.close(); }
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const path=resolve(process.argv[2] || resolve(dirname(fileURLToPath(import.meta.url)),'..','data','registrar.sqlite'));
  console.log(await loadSuppliedCurriculum(path));
}
