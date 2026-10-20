import { DatabaseSync, backup } from 'node:sqlite';
import { mkdir, access, link, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, resolve, basename, extname } from 'node:path';
import { pathToFileURL } from 'node:url';

function verifyBackup(path) {
  const db = new DatabaseSync(path, { readOnly: true });
  try {
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok') throw new Error('Backup integrity check failed.');
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Backup foreign key check failed.');
    const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row => row.name));
    if (!['students', 'subjects', 'terms', 'sections', 'enrollments', 'audit_log'].every(name => tables.has(name))) throw new Error('Backup does not contain an enrollment database.');
  } finally { db.close(); }
}

export async function backupDatabase(source, destination) {
  await mkdir(dirname(destination), { recursive: true });
  // Publish a verified recovery point exclusively; never replace a live DB or backup.
  try { await access(destination); throw new Error('Backup destination already exists.'); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const temporary = destination + '.' + randomUUID() + '.partial';
  try {
    const db = new DatabaseSync(source, { readOnly: true });
    try { await backup(db, temporary); } finally { db.close(); }
    verifyBackup(temporary);
    try { await link(temporary, destination); }
    catch (error) { if (error.code === 'EEXIST') throw new Error('Backup destination already exists.'); throw error; }
    return destination;
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
}

export async function ensureDailyBackup(source, date = new Date()) {
  const folder = resolve(dirname(source), 'backups');
  const prefix = basename(source, extname(source));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
  const destination = resolve(folder, `${prefix}-${today}.sqlite`);
  try { await access(destination); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return backupDatabase(source, destination);
  }
  // An incomplete or corrupted existing file must trigger an operator-visible error.
  verifyBackup(destination);
  return destination;
}

export function startDailyBackups(source, onError = () => {}) {
  if (source === ':memory:') return () => {};
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await ensureDailyBackup(source);
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
