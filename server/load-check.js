import assert from 'node:assert/strict';
import { once } from 'node:events';
import { startServer } from './http.js';

// Sample-only local API smoke load. This is not a production enrollment benchmark.
const server = startServer(0, ':memory:');
try {
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const setup = await fetch(`${base}/auth/setup`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-registrar-request': '1' }, body: JSON.stringify({ password: 'sample-load-password' }) });
  assert.equal(setup.status, 200);
  const cookie = setup.headers.get('set-cookie').split(';')[0];
  const summary = [];
  async function batch(name, makeRequest) {
    const results = await Promise.all(Array.from({ length: 50 }, async (_, index) => {
      const begin = performance.now();
      const response = await makeRequest(index);
      assert.equal(response.status, 200);
      const payload = await response.json();
      return { ms: performance.now() - begin, payload };
    }));
    const elapsed = results.map(row => row.ms).sort((a, b) => a - b);
    const p95 = elapsed[Math.ceil(elapsed.length * .95) - 1];
    summary.push({ endpoint: name, concurrency: 50, requests: 50, p95ms: Math.round(p95), maxMs: Math.round(elapsed.at(-1)), targetMs: 3000, passed: p95 < 3000 });
    return results;
  }
  const registrations = await batch('POST /public/register', index => fetch(`${base}/public/register`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-registrar-request': '1' }, body: JSON.stringify({ first: `Sample${index}`, last: 'Load', email: `load-${index}@example.test`, birth: '01/01/2008', gender: 'Unspecified', address: 'Sample address', phone: '0000000', program: 'Sample program', level: '1st year', admitted: '10/01/2026', studentType: 'regular', semester: 1, consent: true }) }));
  assert.equal(new Set(registrations.map(row => row.payload.id)).size, 50);
  await batch('GET /data (50 sample students)', () => fetch(`${base}/data`, { headers: { cookie } }));
  await batch('GET /reports (50 unassigned students)', () => fetch(`${base}/reports`, { headers: { cookie } }));
  console.log(JSON.stringify({ scope: 'Local API smoke load, in-memory SQLite, sample data, no browser rendering or login load', results: summary }, null, 2));
  assert.ok(summary.every(row => row.passed), 'Local API p95 exceeded 3000 ms.');
} finally { await new Promise(resolve => server.close(resolve)); }
