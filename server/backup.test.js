import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from './db.js';
import { backupDatabase, restoreCopy, ensureDailyBackup } from './backup.js';

test('online backup restores intact records and refuses to overwrite recovery points', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'enrollment-recovery-'));
  const source = join(folder, 'source.sqlite'), destination = join(folder, 'backup.sqlite'), restored = join(folder, 'restored.sqlite');
  const store = openStore(source);
  try {
    store.createTerm({ year: 2028, semester: 2 }, null);
    await backupDatabase(source, destination);
    await assert.rejects(backupDatabase(source, destination), /already exists/);
    await restoreCopy(destination, restored);
    await assert.rejects(restoreCopy(destination, restored), /exist/i);
    const copy = openStore(restored);
    try { assert.equal(copy.list().term.id, '2028-2'); } finally { copy.close(); }
    // A live WAL database can also be used as the recovery source without losing committed records.
    const liveRestore = join(folder, 'live-restored.sqlite');
    await restoreCopy(source, liveRestore);
    const liveCopy = openStore(liveRestore);
    try { assert.equal(liveCopy.list().term.id, '2028-2'); } finally { liveCopy.close(); }
  } finally { store.close(); await rm(folder, { recursive: true, force: true }); }
});


test('daily backups verify existing recovery files instead of trusting their filename', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'enrollment-daily-check-'));
  const source = join(folder, 'source.sqlite');
  const store = openStore(source);
  try {
    const date = new Date('2026-10-20T00:00:00Z');
    const destination = await ensureDailyBackup(source, date);
    assert.equal(await ensureDailyBackup(source, date), destination);
    await writeFile(destination, 'not a database');
    await assert.rejects(ensureDailyBackup(source, date));
    assert.equal(await readFile(destination, 'utf8'), 'not a database', 'invalid recovery points are reported, never silently replaced');
    await writeFile(destination, '');
    await assert.rejects(ensureDailyBackup(source, date), /enrollment database/);
  } finally { store.close(); await rm(folder, { recursive: true, force: true }); }
});

test('concurrent backups publish one verified recovery point without overwriting it or leaving partial files', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'enrollment-backup-race-'));
  const source = join(folder, 'source.sqlite'), destination = join(folder, 'recovery.sqlite');
  const store = openStore(source);
  try {
    const results = await Promise.allSettled([backupDatabase(source, destination), backupDatabase(source, destination)]);
    assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
    assert.equal(results.filter(row => row.status === 'rejected').length, 1);
    assert.match(results.find(row => row.status === 'rejected').reason.message, /already exists/);
    assert.equal((await readdir(folder)).some(name => name.endsWith('.partial')), false);
    const restored = openStore(destination);
    try { assert.equal(restored.list().term.id, store.list().term.id); } finally { restored.close(); }
  } finally { store.close(); await rm(folder, { recursive: true, force: true }); }
});

test('invalid backup sources never become published recovery points', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'enrollment-backup-invalid-'));
  const source = join(folder, 'empty.sqlite'), destination = join(folder, 'recovery.sqlite');
  try {
    await writeFile(source, '');
    await assert.rejects(backupDatabase(source, destination), /enrollment database/);
    assert.deepEqual(await readdir(folder), ['empty.sqlite']);
  } finally { await rm(folder, { recursive: true, force: true }); }
});
