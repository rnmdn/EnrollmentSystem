import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { compare } from 'bcryptjs';
import { openStore } from './db.js';
import { startServer } from './http.js';

const registrarActor = { role: 'registrar', id: 'registrar' };
const password = 'recovery-original-password';
const replacement = 'recovery-replacement-password';
const person = {
  first: 'Recovery', last: 'Learner', birth: '01/02/2008', gender: 'Unspecified',
  address: 'Sample address', phone: '0000000', email: 'recovery@example.test',
  program: 'BS Information Technology', level: '1st year', admitted: '10/01/2026', consent: true,
};
const verification = { identityVerified: true, reason: 'Identity checked against the existing school record.' };

async function fixture(t) {
  const store = openStore(':memory:');
  const server = startServer(0, ':memory:', { store });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '';
    return async (path, method = 'GET', input) => {
      const response = await fetch(base + path, {
        method, headers: { 'content-type': 'application/json', 'x-registrar-request': '1', cookie },
        body: input === undefined ? undefined : JSON.stringify(input),
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
  }
  const registrar = client();
  assert.equal((await registrar('/api/auth/setup', 'POST', { password })).status, 200);
  assert.equal((await registrar('/api/auth/logout', 'POST', {})).status, 200);
  assert.equal((await registrar('/api/auth/login', 'POST', { role: 'registrar', password })).status, 200);
  assert.equal((await registrar('/api/staff/department-head', 'POST', { password })).status, 200);
  const registered = await client()('/api/public/register', 'POST', { ...person, password });
  assert.equal(registered.status, 200);
  const student = await registered.json();
  return { store, client, registrar, student };
}

function resetToken(result) {
  const link = result.resetUrl;
  assert.match(link, /^\/student\.html\?view=reset#token=/, 'recovery returns a relative student reset link with the token in its fragment');
  const url = new URL(link, 'http://127.0.0.1');
  assert.equal(url.pathname, '/student.html');
  assert.equal(url.search, '?view=reset');
  const token = new URLSearchParams(url.hash.slice(1)).get('token');
  assert.ok(token && token.length >= 32);
  return token;
}

async function issue(registrar, role, target) {
  const response = await registrar('/api/recovery', 'POST', { role, target, ...verification });
  assert.equal(response.status, 201);
  return resetToken(await response.json());
}

test('only the Registrar issues recovery after explicit identity verification and a reason, for supported roles', async t => {
  const { client, registrar, student } = await fixture(t);
  const head = client(), learner = client(), anonymous = client();
  assert.equal((await head('/api/auth/login', 'POST', { role: 'department_head', password })).status, 200);
  assert.equal((await learner('/api/auth/login', 'POST', { role: 'student', id: student.id, password })).status, 200);
  const input = { role: 'student', target: student.id, ...verification };
  for (const prefix of ['/api', '/api/v1']) {
    assert.equal((await anonymous(prefix + '/recovery', 'POST', input)).status, 401);
    for (const request of [head, learner]) {
      assert.equal((await request(prefix + '/recovery', 'POST', { ...input, actor: registrarActor })).status, 403);
    }
  }
  for (const invalid of [
    { ...input, identityVerified: false }, { ...input, identityVerified: undefined },
    { ...input, identityVerified: 'true' }, { ...input, reason: '' }, { ...input, reason: '   ' },
    { ...input, reason: undefined }, { ...input, role: 'registrar', target: 'registrar' },
    { ...input, role: 'unknown' },
  ]) {
    const response = await registrar('/api/recovery', 'POST', invalid);
    assert.ok([403, 422].includes(response.status), `invalid recovery request: ${JSON.stringify(invalid)}`);
    assert.ok(!JSON.stringify(await response.json()).includes('#token='));
  }
  assert.equal((await registrar('/api/recovery', 'POST', { ...input, target: '26-99999' })).status, 404);
  assert.ok(await issue(registrar, 'student', student.id));
  assert.ok(await issue(registrar, 'department_head', 'department_head'));
});

test('student reset replaces the bcrypt password once and revokes every existing student session', async t => {
  const { store, client, registrar, student } = await fixture(t);
  const first = client(), second = client(), anonymous = client();
  for (const request of [first, second]) {
    assert.equal((await request('/api/auth/login', 'POST', { role: 'student', id: student.id, password })).status, 200);
    assert.equal((await request('/api/me')).status, 200);
  }
  const oldHash = store.studentPassword(student.id);
  const token = await issue(registrar, 'student', student.id);
  assert.equal(store.studentPassword(student.id), oldHash, 'issuing a link does not change credentials');
  assert.equal((await first('/api/me')).status, 200, 'issuing a link does not log the student out');
  assert.equal((await anonymous('/api/public/reset-password', 'POST', { token, password: 'short' })).status, 422);
  assert.equal(store.studentPassword(student.id), oldHash);
  assert.equal((await anonymous('/api/v1/public/reset-password', 'POST', { token, password: replacement })).status, 200);
  const hash = store.studentPassword(student.id);
  assert.match(hash, /^\$2b\$10\$/);
  assert.equal(await compare(replacement, hash), true);
  for (const request of [first, second]) assert.equal((await request('/api/me')).status, 401);
  assert.equal((await registrar('/api/data')).status, 200);
  assert.equal((await anonymous('/api/public/reset-password', 'POST', { token, password })).status, 409);
  assert.equal(store.studentPassword(student.id), hash, 'replay cannot overwrite the new password');
  assert.equal((await client()('/api/auth/login', 'POST', { role: 'student', id: student.id, password })).status, 401);
  assert.equal((await client()('/api/auth/login', 'POST', { role: 'student', id: student.id, password: replacement })).status, 200);
});

test('Department Head recovery changes that account and revokes its sessions without changing Registrar credentials', async t => {
  const { store, client, registrar } = await fixture(t);
  const first = client(), second = client();
  for (const request of [first, second]) {
    assert.equal((await request('/api/auth/login', 'POST', { role: 'department_head', password })).status, 200);
  }
  const registrarHash = store.registrarPassword();
  const token = await issue(registrar, 'department_head', 'department_head');
  assert.equal((await client()('/api/public/reset-password', 'POST', { token, password: replacement })).status, 200);
  assert.equal(await compare(replacement, store.staffPassword('department_head')), true);
  for (const request of [first, second]) assert.equal((await request('/api/data')).status, 401);
  assert.equal(store.registrarPassword(), registrarHash);
  assert.equal((await registrar('/api/data')).status, 200);
  assert.equal((await client()('/api/auth/login', 'POST', { role: 'department_head', password })).status, 401);
  assert.equal((await client()('/api/auth/login', 'POST', { role: 'department_head', password: replacement })).status, 200);
});

test('reset tokens expire at the deadline and issuing a replacement invalidates the older token', t => {
  let clock = new Date('2026-10-17T00:00:00Z');
  const store = openStore(':memory:', { now: () => clock });
  t.after(() => store.close());
  const student = store.addStudent(person, registrarActor);
  store.setStudentPassword(student.id, 'original-test-hash');
  const digest = token => createHash('sha256').update(token).digest('hex');
  const oldToken = digest('old-fixture-token'), currentToken = digest('current-fixture-token');
  store.issueReset('student', student.id, oldToken, registrarActor);
  const issued = store.issueReset('student', student.id, currentToken, registrarActor);
  assert.throws(() => store.redeemReset(oldToken, 'wrong-test-hash'), /expired|used/i);
  clock = new Date(issued.expiresAt);
  assert.throws(() => store.redeemReset(currentToken, 'expired-test-hash'), /expired|used/i);
  assert.equal(store.studentPassword(student.id), 'original-test-hash');
  const usableToken = digest('usable-fixture-token');
  const usable = store.issueReset('student', student.id, usableToken, registrarActor);
  clock = new Date(Date.parse(usable.expiresAt) - 1);
  assert.deepEqual(store.redeemReset(usableToken, 'replacement-test-hash'), { role: 'student', id: student.id });
  assert.equal(store.studentPassword(student.id), 'replacement-test-hash');
  assert.throws(() => store.redeemReset(usableToken, 'replayed-test-hash'), /expired|used/i);
  assert.equal(store.studentPassword(student.id), 'replacement-test-hash');
});
