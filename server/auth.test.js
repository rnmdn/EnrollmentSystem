import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { scryptSync } from 'node:crypto';
import { compare } from 'bcryptjs';
import { openStore } from './db.js';
import { startServer } from './http.js';

const password = 'test-password';
const person = { first: 'Test', last: 'Student', birth: '01/01/2008', gender: 'Female', address: 'Test address', phone: '0000000', email: 'student@example.test', program: 'BS CS', level: '1st year', admitted: '10/01/2026', privacyConsent: true };

async function fixture(t, options = {}) {
  const server = startServer(0, ':memory:', options);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  assert.equal(server.address().address, '127.0.0.1');
  const base = `http://127.0.0.1:${server.address().port}`;
  function client() {
    let cookie = '';
    return async (path, method = 'GET', input, headers = {}) => {
      const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json', 'x-registrar-request': '1', cookie, ...headers }, body: input === undefined ? undefined : JSON.stringify(input) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
  }
  return { client };
}
async function setup(request) {
  const response = await request('/api/auth/setup', 'POST', { password });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Path=\//);
}

test('role boundaries apply to both API prefixes and actors cannot be supplied by clients', async t => {
  const { client } = await fixture(t);
  const registrar = client(), head = client(), student = client(), anonymous = client();
  assert.deepEqual(await (await anonymous('/api/v1/auth/status')).json(), { configured: false, authenticated: false, role: null, id: null, departmentHeadConfigured: false });
  await setup(registrar);
  assert.equal((await anonymous('/api/auth/setup', 'POST', { password: 'replacement' })).status, 409);
  assert.equal((await registrar('/api/v1/staff/department-head', 'POST', { password })).status, 200);
  assert.equal((await head('/api/auth/login', 'POST', { role: 'department_head', password, id: 'registrar' })).status, 200);
  const registration = await (await anonymous('/api/public/register', 'POST', { ...person, password })).json();
  assert.equal((await student('/api/v1/auth/login', 'POST', { role: 'student', id: registration.id, password })).status, 200);
  assert.deepEqual(await (await student('/api/auth/status')).json(), { configured: true, authenticated: true, role: 'student', id: registration.id, departmentHeadConfigured: true });
  const registrarRoutes = [
    ['/staff/department-head','POST',{ password }], ['/terms','POST',{}], ['/terms/2026-1/activate','POST',{}],
    ['/import','POST',{}], ['/students','POST',person], ['/students/26-00002','PUT',person],
    ['/students/26-00002/review','POST',{}], ['/students/26-00002/completed-subjects','POST',{code:'CS 101'}],
    ['/sections','POST',{}], ['/curriculum','POST',{}], ['/enrollments','POST',{}], ['/enrollments/confirm','POST',{}],
    ['/enrollments/offer','POST',{}], ['/enrollments/26-00002/confirm','POST',{}], ['/enrollments','DELETE',{}]
  ];
  for (const prefix of ['/api','/api/v1']) {
    for (const [path, method, input] of registrarRoutes) {
      assert.equal((await anonymous(prefix + path, method, input)).status, 401, path);
      assert.equal((await head(prefix + path, method, { ...input, actor: { role: 'registrar', id: 'registrar' } })).status, 403, path);
      assert.equal((await student(prefix + path, method, input)).status, 403, path);
    }
    for (const [path, method, input] of [['/data','GET'], ['/audit','GET'], ['/reports','GET'], ['/assignments','POST',{}]]) {
      assert.equal((await anonymous(prefix + path, method, input)).status, 401);
      assert.equal((await student(prefix + path, method, input)).status, 403);
    }
    for (const path of ['/data','/reports','/audit']) assert.equal((await head(prefix + path)).status, 200, path);
    assert.equal((await registrar(prefix + '/me')).status, 403);
    assert.equal((await anonymous(prefix + '/me/grades')).status, 401);
    assert.equal((await registrar(prefix + '/me/grades')).status, 403);
    assert.equal((await head(prefix + '/me/grades')).status, 403);
    const ownGrades = await (await student(prefix + '/me/grades?studentId=26-99999')).json();
    assert.equal(ownGrades.id, registration.id, 'student identity comes only from the session');
    assert.deepEqual(Object.keys(ownGrades).sort(), ['id', 'name', 'otherResults', 'program', 'subjects']);
    assert.equal((await head(prefix + '/me/respond', 'POST', {status:'accepted',revision:1})).status, 403);
  }
  const headData = await (await head('/api/data')).json();
  assert.deepEqual(headData.students, []);
  assert.equal((await anonymous('/api/auth/login', 'POST', {password}, {'x-registrar-request':''})).status, 403);
});

test('student account creation is first-use only and public lookup exposes no schedule', async t => {
  const { client } = await fixture(t);
  const request = client();
  assert.equal((await request('/api/public/register', 'POST', { ...person, privacyConsent: false })).status, 422);
  assert.equal((await request('/api/public/register', 'POST', { ...person, password:'short' })).status, 422);
  assert.equal((await request('/api/public/register', 'POST', { ...person, password:'é'.repeat(37) })).status, 422);
  for (const input of [null, [], { password }, { id:'26-00001',email:[],birth:person.birth,password }]) {
    assert.equal((await request('/api/public/account', 'POST', input)).status, 422);
  }
  assert.equal((await request('/api/public/student', 'POST', {})).status, 422);
  const registrar = client();
  await setup(registrar);
  assert.equal((await (await registrar('/api/data')).json()).students.length, 0);
  const registration = await (await request('/api/public/register', 'POST', { ...person, privacyConsent: undefined, consent: true })).json();
  const account = {id: registration.id, email: person.email, birth: person.birth, password};
  assert.equal((await request('/api/public/account', 'POST', {...account, email:'wrong@example.test'})).status, 404);
  assert.equal((await request('/api/v1/public/account', 'POST', account)).status, 200);
  assert.equal((await request('/api/public/account', 'POST', {...account,password:'replacement'})).status, 409);
  assert.equal((await request('/api/public/register', 'POST', {...person,password:'replacement'})).status, 200);
  assert.equal((await request('/api/auth/login', 'POST', {role:'student',id:registration.id,password})).status, 200);
  const limited = await (await request('/api/public/student','POST',account)).json();
  assert.deepEqual(Object.keys(limited).sort(), ['hasAccount','id','reviewed','term','updatedAt']);
  assert.equal(limited.hasAccount, true);
  assert.equal((await request('/api/me')).status, 200);
  assert.equal((await request('/api/v1/auth/logout', 'POST', {})).status, 200);
  assert.equal((await request('/api/me')).status, 401);
  assert.equal((await request('/api/auth/login','POST',{role:'student',id:registration.id,password:'replacement'})).status, 401);
});

test('sessions refresh on activity, expire after eight idle hours, rotate on login and revoke on logout', async t => {
  let clock = 1_000_000;
  const {client} = await fixture(t, {now: () => clock});
  const request = client();
  await setup(request);
  const first = await request('/api/auth/status');
  const oldCookie = first.headers.get('set-cookie').split(';')[0];
  for (let count = 0; count < 3; count++) {
    clock += 7 * 60 * 60 * 1000;
    const response = await request('/api/v1/auth/status');
    assert.equal((await response.json()).authenticated, true);
    assert.match(response.headers.get('set-cookie'), /Max-Age=28800/);
  }
  assert.equal((await request('/api/auth/login', 'POST', {password})).status, 200);
  assert.equal((await client()('/api/data','GET',undefined,{cookie:oldCookie})).status, 401);
  clock += 8 * 60 * 60 * 1000;
  assert.equal((await request('/api/data')).status, 401);
  assert.equal((await (await request('/api/auth/status')).json()).authenticated, false);
  await request('/api/auth/login','POST',{password});
  const activeCookie = (await request('/api/auth/status')).headers.get('set-cookie').split(';')[0];
  const logout = await request('/api/auth/logout','POST',{});
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await client()('/api/data','GET',undefined,{cookie:activeCookie})).status,401);
});

test('login throttling covers unknown accounts and both API aliases', async t => {
  let clock = 1_000_000;
  const {client} = await fixture(t, {now: () => clock});
  const request = client();
  await setup(request);
  for (let count = 0; count < 5; count++) assert.equal((await request('/api/auth/login','POST',{role:'student',id:'26-99999',password})).status,401);
  const blocked = await client()('/api/v1/auth/login','POST',{password});
  assert.equal(blocked.status,429);
  assert.equal(blocked.headers.get('retry-after'),'60');
  clock += 60_000;
  assert.equal((await request('/api/auth/login','POST',{password})).status,200);
});

test('student response uses session identity and legacy enrollments offer before confirmation', async t => {
  const {client} = await fixture(t);
  const registrar = client(), student = client(), other = client();
  await setup(registrar);
  const id = (await (await student('/api/public/register','POST',{...person,password})).json()).id;
  const otherId = (await (await other('/api/public/register','POST',{...person,first:'Other',email:'other@example.test',password})).json()).id;
  await student('/api/auth/login','POST',{role:'student',id,password});
  await other('/api/auth/login','POST',{role:'student',id:otherId,password});
  assert.equal((await registrar(`/api/students/${id}/review`,'POST',{})).status,200);
  assert.equal((await registrar('/api/curriculum','POST',{code:'CS 101',title:'Computing',program:'BS CS',yearLevel:1,semester:1,units:3})).status,201);
  const section = await (await registrar('/api/sections','POST',{code:'CS 101',title:'Computing',section:'A',instructor:'Test Teacher',day:'Monday',start:'09:00',end:'10:00',room:'R1',capacity:10})).json();
  const offer = await registrar('/api/v1/enrollments/confirm','POST',{studentId:id,sectionIds:[section.id]});
  assert.equal(offer.status,201);
  const plan = await offer.json();
  assert.equal(plan.status,'pending');
  assert.equal((await registrar(`/api/enrollments/${id}/confirm`,'POST',{})).status,409);
  assert.equal((await other('/api/me/respond','POST',{id,studentId:id,status:'accepted',revision:plan.revision,actor:{role:'student',id}})).status,404);
  assert.equal((await student('/api/me/respond','POST',{status:'confirmed',revision:plan.revision})).status,422);
  assert.equal((await student('/api/me/respond','POST',{status:'accepted',revision:plan.revision-1})).status,409);
  assert.equal((await student('/api/v1/me/respond','POST',{studentId:otherId,status:'accepted',revision:plan.revision})).status,200);
  assert.equal((await registrar(`/api/v1/enrollments/${id}/confirm`,'POST',{})).status,200);
  const view = await (await student(`/api/me?id=${otherId}`)).json();
  assert.equal(view.id,id);
  assert.equal(view.plan.status,'confirmed');
  assert.equal((await registrar('/api/enrollments','DELETE',{studentId:id,sectionId:section.id})).status,409);
});

test('reports pass allowed filters and actor; CSV escapes formulas, quotes and line breaks', async t => {
  const calls = [];
  let hash;
  const rows = [{name:'=1+1',notes:'Comma, "quote"\nnew line',empty:null}, {name:'  @SUM(1)',notes:'\tformula'}, {name:'-2',notes:'+command'}, {name:'Safe',notes:'普通文本'}];
  const store = { close() {}, staffPassword:role => role === 'registrar' ? hash : null, setRegistrarPassword:value => {hash = value;}, reports:(filters,actor) => {calls.push({filters,actor});return rows;} };
  const {client} = await fixture(t,{store});
  const request = client();
  await setup(request);
  assert.match(hash, /^\$2b\$10\$/);
  assert.deepEqual(await (await request('/api/reports?term=2026-1&program=BS%20CS&status=confirmed&role=student')).json(), rows);
  assert.deepEqual(calls[0],{filters:{term:'2026-1',program:'BS CS',status:'confirmed'},actor:{role:'registrar',id:'registrar'}});
  const response = await request('/api/v1/reports?format=csv');
  assert.match(response.headers.get('content-type'),/^text\/csv/);
  assert.match(response.headers.get('content-disposition'),/attachment/);
  const output = await response.text();
  assert.match(output,/"'=1\+1"/);
  assert.match(output,/"'  @SUM\(1\)"/);
  assert.match(output,/"'-2"/);
  assert.match(output,/"'\+command"/);
  assert.match(output,/"'\tformula"/);
  assert.match(output,/"Comma, ""quote""\nnew line"/);
});

test('new passwords use bcrypt, reject oversized UTF-8 before writes, and legacy scrypt still logs in', async t => {
  const store = openStore(':memory:');
  const {client} = await fixture(t,{store});
  const registrar = client();
  assert.equal((await registrar('/api/auth/setup','POST',{password:'a'.repeat(73)})).status,422);
  assert.equal(store.registrarPassword(),null);
  await setup(registrar);
  assert.match(store.registrarPassword(),/^\$2b\$10\$/);
  assert.equal(await compare(password,store.registrarPassword()),true);
  await registrar('/api/staff/department-head','POST',{password});
  const headHash = store.staffPassword('department_head');
  assert.match(headHash,/^\$2b\$10\$/);
  assert.equal((await registrar('/api/staff/department-head','POST',{password:'é'.repeat(37)})).status,409);
  assert.equal(store.staffPassword('department_head'),headHash);
  const publicClient = client();
  const id = (await (await publicClient('/api/public/register','POST',{...person,password})).json()).id;
  assert.match(store.studentPassword(id),/^\$2b\$10\$/);
  const otherId = (await (await publicClient('/api/public/register','POST',{...person,first:'Other',email:'other@example.test'})).json()).id;
  const credentials = {id:otherId,email:'other@example.test',birth:person.birth};
  assert.equal((await publicClient('/api/public/account','POST',{...credentials,password:'é'.repeat(37)})).status,422);
  assert.equal(store.studentPassword(otherId),null);
  assert.equal((await publicClient('/api/public/account','POST',{...credentials,password:'é'.repeat(36)})).status,200);
  assert.match(store.studentPassword(otherId),/^\$2b\$10\$/);
  assert.equal(await compare('é'.repeat(36),store.studentPassword(otherId)),true);
  const salt = '0123456789abcdef0123456789abcdef';
  store.setStaffPassword('registrar',`${salt}:${scryptSync(password,salt,64).toString('hex')}`);
  const legacy = await client()('/api/auth/login','POST',{password});
  assert.equal(legacy.status,200);
  assert.deepEqual(await legacy.json(),{authenticated:true,role:'registrar',id:'registrar'});
});

test('simultaneous logins cannot bypass the shared throttle', async t => {
  const {client} = await fixture(t);
  const attempts = await Promise.all(Array.from({length:10},() => client()('/api/v1/auth/login','POST',{password})));
  assert.equal(attempts.filter(response => response.status === 401).length,5);
  assert.equal(attempts.filter(response => response.status === 429).length,5);
});

test('legacy scrypt passwords retain the original 128 character limit', async t => {
  const store = openStore(':memory:');
  const {client} = await fixture(t,{store});
  const legacyPassword = 'é'.repeat(128);
  const salt = '0123456789abcdef0123456789abcdef';
  store.setRegistrarPassword(`${salt}:${scryptSync(legacyPassword,salt,64).toString('hex')}`);
  assert.equal((await client()('/api/auth/login','POST',{password:legacyPassword})).status,200);
  assert.equal((await client()('/api/auth/login','POST',{password:legacyPassword+'a'})).status,401);
});

test('department-head password replacement revokes all old sessions and rejects the old password', async t => {
  const {client} = await fixture(t);
  const registrar = client(), first = client(), second = client();
  await setup(registrar);
  await registrar('/api/staff/department-head','POST',{password});
  for (const request of [first,second]) assert.equal((await request('/api/auth/login','POST',{role:'department_head',password})).status,200);
  assert.equal((await registrar('/api/v1/staff/department-head','POST',{password:'replacement-password'})).status,409);
  const reset = await (await registrar('/api/recovery','POST',{role:'department_head',identityVerified:true,reason:'Synthetic verified identity reference'})).json();
  const token = new URLSearchParams(new URL(reset.resetUrl,'http://localhost').hash.slice(1)).get('token');
  assert.equal((await client()('/api/public/reset-password','POST',{token,password:'replacement-password'})).status,200);
  for (const request of [first,second]) {
    assert.equal((await request('/api/data')).status,401);
    assert.equal((await (await request('/api/auth/status')).json()).authenticated,false);
  }
  assert.equal((await first('/api/auth/login','POST',{role:'department_head',password})).status,401);
  assert.equal((await first('/api/auth/login','POST',{role:'department_head',password:'replacement-password'})).status,200);
  assert.equal((await registrar('/api/data')).status,200);
});

test('concurrent Department Head setup creates one credential and never replaces the winner', async t => {
  const store = openStore(':memory:');
  const { client } = await fixture(t, { store });
  const registrar = client();
  await setup(registrar);
  const choices = ['first-head-password', 'second-head-password'];
  const responses = await Promise.all(choices.map(value => registrar('/api/staff/department-head', 'POST', { password: value })));
  assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
  const winner = responses.findIndex(response => response.status === 200);
  const original = store.staffPassword('department_head');
  assert.equal(await compare(choices[winner], original), true);
  assert.equal((await registrar('/api/v1/staff/department-head', 'POST', { password: 'replacement-head-password' })).status, 409);
  assert.equal(store.staffPassword('department_head'), original);
});

test('main and practice sessions remain independent when a browser shares localhost cookies', async t => {
  const main = startServer(0, ':memory:');
  const practice = startServer(0, ':memory:', {practice:true});
  t.after(async()=>{await Promise.all([main,practice].map(server=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections();})));});
  await Promise.all([once(main,'listening'),once(practice,'listening')]);
  const jar = new Map();
  async function request(server,path,method='GET',input) {
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{method,headers:{cookie:[...jar].map(([key,value])=>`${key}=${value}`).join('; '),'content-type':'application/json','x-registrar-request':'1'},body:input===undefined?undefined:JSON.stringify(input)});
    const setCookie=response.headers.get('set-cookie');
    if(setCookie){const [key,value]=setCookie.split(';')[0].split('=');if(value)jar.set(key,value);else jar.delete(key);}
    return response;
  }
  assert.equal((await request(main,'/auth/setup','POST',{password})).status,200);
  assert.equal((await request(practice,'/auth/setup','POST',{password})).status,200);
  for(const server of [main,practice]) assert.equal((await (await request(server,'/auth/status')).json()).authenticated,true);
  assert.equal(jar.size,2);
  await request(practice,'/auth/logout','POST',{});
  assert.equal((await (await request(main,'/auth/status')).json()).authenticated,true);
  assert.equal((await (await request(practice,'/auth/status')).json()).authenticated,false);
});
