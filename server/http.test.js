import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startServer } from './http.js';

test('registrar access is protected and imported browser records are preserved', async () => {
  const server = startServer(0, ':memory:');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    const request = async (path, method = 'GET', data) => {
      const response = await fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-registrar-request': '1', cookie },
      body: data === undefined ? undefined : JSON.stringify(data)
      });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    assert.equal((await request('/api/data')).status, 401);
    assert.equal((await request('/api/auth/setup', 'POST', { password: 'test-password' })).status, 200);
    assert.equal((await request('/api/data')).status, 200);
    const imported = await request('/api/import', 'POST', {
      students: [{ id: '26-00007', first: 'Lea', last: 'Cruz', email: 'lea@example.test', program: 'BS CS', level: '2nd year', admitted: '10/01/2026', status: 'Active' }],
      sections: [{ id: 'SEC-007', code: 'CS 201', title: 'Data Structures', section: 'A', instructor: 'Prof. Lim', day: 'Tuesday', start: '09:00', end: '10:00', room: 'Lab 2', capacity: 20 }],
      enrollments: [{ studentId: '26-00007', sectionId: 'SEC-007' }]
    });
    assert.equal(imported.status, 200);
    const data = await (await request('/api/data')).json();
    assert.equal(data.students[0].id, '26-00007');
    assert.deepEqual(data.enrollments[0], { studentId: '26-00007', sectionId: 'SEC-007' });
    assert.equal((await request('/api/session')).status, 404);
  } finally { server.close(); }
});

test('public student registration is reviewed before enrollment', async () => {
  const server = startServer(0, ':memory:');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    const request = async (path, payload) => {
      const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-registrar-request': '1', cookie }, body: JSON.stringify(payload) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    const person = { first: 'Nia', last: 'Tan', birth: '01/01/2008', gender: 'Female', address: 'Test address', phone: '0000000', email: 'nia@example.test', program: 'BS CS', level: '1st year', admitted: '10/01/2026', status: 'Active' };
    const registration = await (await request('/api/public/register', { ...person, privacyConsent: true })).json();
    assert.match(registration.id, /^\d{2}-\d{5}$/);
    assert.equal((await request(`/api/students/${registration.id}/review`, {})).status, 401);
    assert.equal((await request('/api/auth/setup', { password: 'test-password' })).status, 200);
    assert.equal((await request(`/api/students/${registration.id}/review`, {})).status, 200);
    const student = await (await request('/api/public/student', { id: registration.id, email: person.email, birth: person.birth })).json();
    assert.equal(student.reviewed, true);
    assert.equal('classes' in student, false);
  } finally { server.close(); }
});

test('parallel enrollment requests cannot exceed section capacity', async () => {
  const server = startServer(0, ':memory:');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    let cookie = '';
    const request = async (path, payload) => {
      const response = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-registrar-request': '1', cookie }, body: JSON.stringify(payload) });
      if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
      return response;
    };
    assert.equal((await request('/api/auth/setup', { password: 'test-password' })).status, 200);
    const person = { birth: '01/01/2008', gender: 'Female', address: 'Test address', phone: '0000000', program: 'BS CS', level: '1st year', admitted: '10/01/2026', status: 'Active' };
    const students = await Promise.all([request('/api/students', { ...person, first: 'Ana', last: 'Lee', email: 'ana@example.test' }), request('/api/students', { ...person, first: 'Bea', last: 'Lee', email: 'bea@example.test' })]);
    const ids = await Promise.all(students.map(async response => (await response.json()).id));
    const section = await (await request('/api/sections', { code: 'CS 101', title: 'Computing', section: 'A', instructor: 'Prof. Lee', day: 'Monday', start: '09:00', end: '10:00', room: 'R1', capacity: 1 })).json();
    assert.equal((await request('/api/curriculum', { code: 'CS 101', title: 'Computing', program: 'BS CS', yearLevel: 1, semester: 1, units: 3 })).status, 201);
    const results = await Promise.all(ids.map(studentId => request('/api/enrollments', { studentId, sectionId: section.id })));
    assert.deepEqual(results.map(response => response.status).sort(), [201, 409]);
  } finally { server.close(); }
});


test('large authenticated JSON responses negotiate gzip without caching records or changing payloads', async () => {
  let passwordHash;
  const rows = Array.from({length: 600}, (_, index) => ({name: 'Fictional example '+index, program: 'Sample program', status: 'unassigned'}));
  const store = {close(){},staffPassword:role => role === 'registrar' ? passwordHash : null,setRegistrarPassword:hash => {passwordHash=hash;},reports:()=>rows};
  const server=startServer(0,':memory:',{store});
  try {
    await once(server,'listening');
    const base=`http://127.0.0.1:${server.address().port}`;
    const setup=await fetch(base+'/api/auth/setup',{method:'POST',headers:{'content-type':'application/json','x-registrar-request':'1'},body:JSON.stringify({password:'compression-test-password'})});
    const cookie=setup.headers.get('set-cookie').split(';')[0];
    for(const [encoding,expected] of [['gzip','gzip'],['gzip;q=0','identity'],['identity','identity'],['gzip;q=0.5','gzip']]) {
      const response=await fetch(base+'/api/v1/reports',{headers:{cookie,'accept-encoding':encoding}});
      assert.equal(response.status,200);
      assert.equal(response.headers.get('content-encoding'),expected==='gzip'?'gzip':null);
      assert.equal(response.headers.get('cache-control'),'no-store');
      assert.equal(response.headers.get('vary'),'Accept-Encoding');
      assert.deepEqual(await response.json(),rows);
    }
    assert.equal((await fetch(base+'/api/reports')).status,401);
  } finally { await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();}); }
});
