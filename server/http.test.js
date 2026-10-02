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
