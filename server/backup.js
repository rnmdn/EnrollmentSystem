import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, access, readdir } from 'node:fs/promises';
import { dirname, resolve, basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function backupDatabase(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  // Never replace an existing recovery point or the live database.
  try { await access(destination); throw new Error('Backup destination already exists.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const db = new DatabaseSync(source, { readOnly: true });
  try { await backup(db, destination); } finally { db.close(); }
  const copy = new DatabaseSync(destination, { readOnly: true });
  try {
    if (copy.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup integrity check failed.');
    if (copy.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Backup foreign key check failed.');
  } finally { copy.close(); }
  return destination;
}

export function startDailyBackups(source, onError = () => {}) {
  if (source === ':memory:') return () => {};
  const folder = resolve(dirname(source), 'backups');
  const prefix = basename(source, extname(source));
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await mkdir(folder, { recursive: true });
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Singapore', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
      const existing = await readdir(folder);
      if (!existing.includes(`${prefix}-${today}.sqlite`)) await backupDatabase(source, resolve(folder, `${prefix}-${today}.sqlite`));
    } catch (error) { onError(error); }
    finally { running = false; }
  };
  const timer = setInterval(tick, 60 * 60 * 1000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}

export async function restoreCopy(source, destination) {
  return backupDatabase(source, destination);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const mode = process.argv[2];
  const source = resolve(process.argv[3] || 'data/registrar.sqlite');
  const destination = resolve(process.argv[4] || (mode === 'restore' ? 'data/restore-check.sqlite' : `data/backups/manual-${Date.now()}.sqlite`));
  if (!['backup', 'restore'].includes(mode)) throw new Error('Use backup or restore, followed by source and optional destination.');
  console.log(await (mode === 'restore' ? restoreCopy(source, destination) : backupDatabase(source, destination)));
}
