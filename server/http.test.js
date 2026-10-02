import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startServer } from './http.js';

test('API opens directly and preserves imported browser records', async () => {
  const server = startServer(0, ':memory:');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (path, method = 'GET', data) => fetch(base + path, {
      method,
      headers: { 'content-type': 'application/json', 'x-registrar-request': '1' },
      body: data === undefined ? undefined : JSON.stringify(data)
    });
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

test('parallel enrollment requests cannot exceed section capacity', async () => {
  const server = startServer(0, ':memory:');
  try {
    await once(server, 'listening');
    const base = `http://127.0.0.1:${server.address().port}`;
    const request = (path, payload) => fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-registrar-request': '1' }, body: JSON.stringify(payload) });
    const person = { birth: '01/01/2008', gender: 'Female', address: 'Test address', phone: '0000000', program: 'BS CS', level: '1st year', admitted: '10/01/2026', status: 'Active' };
    const students = await Promise.all([request('/api/students', { ...person, first: 'Ana', last: 'Lee', email: 'ana@example.test' }), request('/api/students', { ...person, first: 'Bea', last: 'Lee', email: 'bea@example.test' })]);
    const ids = await Promise.all(students.map(async response => (await response.json()).id));
    const section = await (await request('/api/sections', { code: 'CS 101', title: 'Computing', section: 'A', instructor: 'Prof. Lee', day: 'Monday', start: '09:00', end: '10:00', room: 'R1', capacity: 1 })).json();
    const results = await Promise.all(ids.map(studentId => request('/api/enrollments', { studentId, sectionId: section.id })));
    assert.deepEqual(results.map(response => response.status).sort(), [201, 409]);
  } finally { server.close(); }
});
