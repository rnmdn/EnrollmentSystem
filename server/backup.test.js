import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openStore } from './db.js';
import { backupDatabase, restoreCopy } from './backup.js';

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
