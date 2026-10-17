import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { institution, programs } from '../institution.js';
import { openStore } from './db.js';
import { startServer } from './http.js';

const paths = ['/api/public/config', '/api/v1/public/config'];

async function fixture(t) {
  const store = openStore(':memory:');
  const server = startServer(0, ':memory:', { store });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  return { store, request: path => fetch(base + path) };
}

test('public config is identical through both aliases without a session or mutation header', async t => {
  const { store, request } = await fixture(t);
  const term = store.publicTerm();
  assert.deepEqual({ ...term }, { id: '2026-1', label: '2026–2027 · Semester 1' });
  const bodies = [];
  for (const path of paths) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/json/);
    assert.equal(response.headers.get('set-cookie'), null);
    const body = await response.json();
    assert.deepEqual(body, { institution, programs, term: { ...term }, practice: false });
    bodies.push(body);
  }
  assert.deepEqual(bodies[0], bodies[1]);
});

test('public config reads only public term data and omits records and staff configuration', async t => {
  const { store, request } = await fixture(t);
  store.setRegistrarPassword('private-test-registrar-hash');
  store.setStaffPassword('department_head', 'private-test-department-head-hash');
  const records = t.mock.method(store, 'list', () => assert.fail('Public config must not read student records.'));
  const staff = t.mock.method(store, 'staffPassword', () => assert.fail('Public config must not read staff configuration.'));
  const publicTerm = t.mock.method(store, 'publicTerm');
  for (const path of paths) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      institution, programs, term: { id: '2026-1', label: '2026–2027 · Semester 1' }, practice: false
    });
  }
  assert.equal(publicTerm.mock.callCount(), 2);
  assert.equal(records.mock.callCount(), 0);
  assert.equal(staff.mock.callCount(), 0);
  for (const path of ['/api/data', '/api/v1/data']) assert.equal((await request(path)).status, 401);
});

test('public config uses the current active term and returns null when none is active', async t => {
  const { store, request } = await fixture(t);
  const { id, label } = store.createTerm({ year: 2027, semester: 2 }, { role: 'registrar', id: 'registrar' });
  for (const path of paths) {
    const response = await request(path);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).term, { id, label });
  }
  for (const missing of [undefined, null]) {
    const publicTerm = t.mock.method(store, 'publicTerm', () => missing);
    for (const path of paths) {
      const response = await request(path);
      assert.equal(response.status, 200);
      assert.deepEqual(await response.json(), { institution, programs, term: null, practice: false });
    }
    publicTerm.mock.restore();
  }
});
