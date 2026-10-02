import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  const server = createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      if (!path.startsWith('/api/')) { await staticFile(req, res); return; }
      if (!['GET','HEAD'].includes(req.method) && req.headers['x-registrar-request'] !== '1') { json(res, 403, { error: 'Request header is missing.' }); return; }
      if (path === '/api/data' && req.method === 'GET') { json(res, 200, store.list()); return; }
      if (path === '/api/terms' && req.method === 'POST') { json(res, 201, store.createTerm(await body(req), null)); return; }
      const termMatch = /^\/api\/terms\/([^/]+)\/activate$/.exec(path);
      if (termMatch && req.method === 'POST') { json(res, 200, store.activateTerm(decodeURIComponent(termMatch[1]), null)); return; }
      if (path === '/api/import' && req.method === 'POST') { json(res, 200, store.importData(await body(req), null)); return; }
      if (path === '/api/students' && req.method === 'POST') { json(res, 201, store.addStudent(await body(req), null)); return; }
      const studentMatch = /^\/api\/students\/([^/]+)$/.exec(path);
      if (studentMatch && req.method === 'PUT') { json(res, 200, store.updateStudent(decodeURIComponent(studentMatch[1]), await body(req), null)); return; }
      if (path === '/api/sections' && req.method === 'POST') { json(res, 201, store.addSection(await body(req), null)); return; }
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
