import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { openStore } from './db.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };

function json(res, status, body, extra = {}) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', ...extra });
  res.end(JSON.stringify(body));
}
async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 128_000) { const error = new Error('Request is too large.'); error.status = 413; throw error; }
  }
  try { return JSON.parse(text || '{}'); }
  catch { const error = new Error('Request must contain valid JSON.'); error.status = 400; throw error; }
}
async function staticFile(req, res) {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const target = resolve(dist, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (target !== dist && !target.startsWith(dist + sep)) { res.writeHead(404); res.end(); return; }
  try {
    const file = await readFile(target);
    res.writeHead(200, { 'content-type': mime[extname(target)] || 'application/octet-stream', 'x-content-type-options': 'nosniff' });
    res.end(file);
  } catch { res.writeHead(404); res.end('Build the app with npm run build first.'); }
}

export function startServer(port = 3001, databasePath = resolve(root, 'data', 'registrar.sqlite')) {
  const store = openStore(databasePath);
  const sessions = new Map();
  let failedLogins = 0;
  let retryAfter = 0;
  const sessionId = req => /(?:^|;\s*)registrar_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
  const authenticated = req => {
    const id = sessionId(req);
    const expires = sessions.get(id);
    if (!expires) return false;
    if (expires < Date.now()) { sessions.delete(id); return false; }
    return true;
  };
  const issueSession = res => {
    const id = randomBytes(32).toString('hex');
    sessions.set(id, Date.now() + 8 * 60 * 60 * 1000);
    json(res, 200, { authenticated: true }, { 'set-cookie': `registrar_session=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` });
  };
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (!path.startsWith('/api/')) { await staticFile(req, res); return; }
      if (!['GET','HEAD'].includes(req.method) && req.headers['x-registrar-request'] !== '1') { json(res, 403, { error: 'Request header is missing.' }); return; }
      if (path === '/api/auth/status' && req.method === 'GET') { json(res, 200, { configured: Boolean(store.registrarPassword()), authenticated: authenticated(req) }); return; }
      if (path === '/api/auth/setup' && req.method === 'POST') {
        const { password } = await body(req);
        if (typeof password !== 'string' || password.length < 8 || password.length > 128) { json(res, 400, { error: 'Choose a password with 8 to 128 characters.' }); return; }
        const salt = randomBytes(16).toString('hex');
        store.setRegistrarPassword(`${salt}:${scryptSync(password, salt, 64).toString('hex')}`);
        issueSession(res); return;
      }
      if (path === '/api/auth/login' && req.method === 'POST') {
        if (Date.now() < retryAfter) { json(res, 429, { error: 'Too many attempts. Try again in one minute.' }); return; }
        const { password } = await body(req);
        const stored = store.registrarPassword();
        const [salt, expected] = (stored || '').split(':');
        const actual = typeof password === 'string' && password.length <= 128 && salt ? scryptSync(password, salt, 64) : Buffer.alloc(64);
        if (!stored || !timingSafeEqual(actual, Buffer.from(expected, 'hex'))) {
          failedLogins += 1;
          if (failedLogins >= 5) { retryAfter = Date.now() + 60_000; failedLogins = 0; }
          json(res, 401, { error: 'Incorrect registrar password.' }); return;
        }
        failedLogins = 0;
        issueSession(res); return;
      }
      if (path === '/api/public/register' && req.method === 'POST') { json(res, 200, store.registerStudent(await body(req))); return; }
      if (path === '/api/public/student' && req.method === 'POST') {
        const input = await body(req);
        json(res, 200, store.studentStatus(input.id, input.email, input.birth)); return;
      }
      if (!authenticated(req)) { json(res, 401, { error: 'Registrar login is required.' }); return; }
      if (path === '/api/auth/logout' && req.method === 'POST') {
        sessions.delete(sessionId(req));
        json(res, 200, { authenticated: false }, { 'set-cookie': 'registrar_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); return;
      }
      if (path === '/api/data' && req.method === 'GET') { json(res, 200, store.list()); return; }
      const reviewMatch = /^\/api\/students\/([^/]+)\/review$/.exec(path);
      if (reviewMatch && req.method === 'POST') { json(res, 200, store.reviewStudent(decodeURIComponent(reviewMatch[1]))); return; }
      if (path === '/api/terms' && req.method === 'POST') { json(res, 201, store.createTerm(await body(req), null)); return; }
      const termMatch = /^\/api\/terms\/([^/]+)\/activate$/.exec(path);
      if (termMatch && req.method === 'POST') { json(res, 200, store.activateTerm(decodeURIComponent(termMatch[1]), null)); return; }
      if (path === '/api/import' && req.method === 'POST') { json(res, 200, store.importData(await body(req), null)); return; }
      if (path === '/api/students' && req.method === 'POST') { json(res, 201, store.addStudent(await body(req), null)); return; }
      const completedMatch = /^\/api\/students\/([^/]+)\/completed-subjects$/.exec(path);
      if (completedMatch && req.method === 'POST') { json(res, 201, store.completeSubject(decodeURIComponent(completedMatch[1]), (await body(req)).code, null)); return; }
      const studentMatch = /^\/api\/students\/([^/]+)$/.exec(path);
      if (studentMatch && req.method === 'PUT') { json(res, 200, store.updateStudent(decodeURIComponent(studentMatch[1]), await body(req), null)); return; }
      if (path === '/api/sections' && req.method === 'POST') { json(res, 201, store.addSection(await body(req), null)); return; }
      if (path === '/api/enrollments/confirm' && req.method === 'POST') {
        const input = await body(req);
        json(res, 201, store.allocateMany(input.studentId, input.sectionIds, null)); return;
      }
      if (path === '/api/enrollments' && req.method === 'POST') {
        const input = await body(req);
        json(res, 201, store.allocate(input.studentId, input.sectionId, null)); return;
      }
      if (path === '/api/enrollments' && req.method === 'DELETE') {
        const input = await body(req);
        store.drop(input.studentId, input.sectionId, null);
        json(res, 200, { ok: true }); return;
      }
      json(res, 404, { error: 'This route does not exist.' });
    } catch (error) {
      const status = error.status || (String(error.message).includes('UNIQUE constraint') ? 409 : 500);
      json(res, status, { error: status === 500 ? 'Server error. Check the server log.' : error.message });
      if (status === 500) console.error(error);
    }
  });
  server.listen(port, '127.0.0.1');
  server.on('close', () => store.close());
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3001);
  startServer(port);
  console.log(`Registrar server ready at http://127.0.0.1:${port}`);
}
