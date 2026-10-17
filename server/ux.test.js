import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openStore } from './db.js';
import { startServer } from './http.js';

const registrar = { role: 'registrar', id: 'registrar' };
const person = { first: 'UX', last: 'Sample', birth: '01/01/2008', gender: 'Prefer not to say', address: 'Sample address', phone: '0000000', email: 'ux.sample@example.test', program: 'BS Information Technology', level: '1st year', consent: true };

test('public registration uses the school term and server submission date rather than editable client values', () => {
  const store = openStore(':memory:');
  try {
    assert.throws(() => store.registerStudent({ ...person, semester: 2 }), /active term has changed/);
    assert.equal(store.list().students.length, 0);
    const term = store.createTerm({ year: 2027, semester: 2 }, registrar);
    assert.throws(() => store.registerStudent({ ...person, termId: '2026-1', semester: 1 }), /active term has changed/);
    const result = store.registerStudent({ ...person, termId: term.id, semester: 2, admitted: '01/01/1900' });
    const student = store.list().students.find(student => student.id === result.id);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: '2-digit', day: '2-digit', year: 'numeric' }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type).value;
    assert.equal(student.admitted, `${part('month')}/${part('day')}/${part('year')}`);
    assert.equal(student.semester, 2);
    assert.equal(store.registerStudent({ ...person, termId: term.id, semester: 2 }).id, result.id);
  } finally { store.close(); }
});

test('student decision data includes recorded units and update time without revealing staff classification', () => {
  const store = openStore(':memory:');
  try {
    const student = store.addStudent({ ...person, admitted: '10/01/2026' }, registrar);
    const subject = { code: 'UX101', title: 'Sample subject', units: 2.5, program: person.program, yearLevel: 1, semester: 1 };
    store.addCurriculum(subject, registrar);
    const section = store.addSection({ ...subject, section: 'A', day: 'Monday', start: '08:00', end: '09:00', room: 'Sample room', instructor: 'Sample instructor', capacity: 5 }, registrar);
    store.offerPlan(student.id, [section.id], registrar);
    const view = store.studentView(student.id);
    assert.equal(view.classes[0].units, 2.5);
    assert.equal(view.classes[0].day, 'Monday');
    assert.ok(view.updatedAt);
    assert.equal('assignedBy' in view.plan, false);
    assert.equal('studentType' in view, false);
    const lookup = store.limitedPublicStatus(student.id, person.email, person.birth);
    assert.ok(lookup.updatedAt);
    assert.equal('classes' in lookup, false);
    assert.equal('plan' in lookup, false);
  } finally { store.close(); }
});

test('stale-term registration fails atomically through both API prefixes', async t => {
  const store = openStore(':memory:');
  const server = startServer(0, ':memory:', { store });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const prefix of ['/api', '/api/v1']) {
    const response = await fetch(`${base}${prefix}/public/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-registrar-request': '1' }, body: JSON.stringify({ ...person, termId: '2025-1', semester: 1 }) });
    assert.equal(response.status, 409);
    assert.match((await response.json()).error, /active term has changed/);
  }
  assert.equal(store.list().students.length, 0);
});
