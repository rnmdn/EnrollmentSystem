import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from './db.js';
import { seedPractice } from './practice.js';

test('practice seeds two fictional students and sections and preserves progress on a second startup', async () => {
  const store = openStore(':memory:');
  try {
    const registrar = {role:'registrar',id:'registrar'};
    const head = {role:'department_head',id:'department_head'};
    const seed = await seedPractice(store);
    const data = store.list(registrar);
    assert.equal(data.students.length,2);
    assert.equal(data.sections.length,2);
    assert.ok(data.students.every(student=>student.email.endsWith('@example.test')));
    assert.equal(store.evaluation(seed.regular.id,registrar).curriculum.find(row=>row.code==='EX102').eligible,true);
    assert.equal(store.evaluation(seed.irregular.id,head).curriculum.find(row=>row.code==='EX102').eligible,false);
    store.chooseBackSubjects(seed.irregular.id,['EX101'],{role:'student',id:seed.irregular.id});
    store.assignSubjects(seed.irregular.id,['EX101'],head);
    const before = store.list(registrar);
    assert.equal((await seedPractice(store)).seeded,false);
    assert.deepEqual(store.list(registrar),before);
  } finally { store.close(); }
});
