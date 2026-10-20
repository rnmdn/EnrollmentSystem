import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { gzip } from 'node:zlib';
import { hash, compare } from 'bcryptjs';
import { openStore } from './db.js';
import { startDailyBackups } from './backup.js';
import { institution, programs } from '../institution.js';
import { plpCurriculum2022 } from '../curriculum/plp-2022.js';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const dist = resolve(root, 'dist');
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.pdf': 'application/pdf', '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf' };
const deriveKey = promisify(scrypt);
const dummyHash = await hash('unavailable-account-password', 10);

function json(res, status, body, extra = {}) {
  const payload = Buffer.from(JSON.stringify(body));
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', vary: 'Accept-Encoding', ...extra };
  const gzipPreference = String(res.req?.headers['accept-encoding'] || '').split(',').map(item => item.trim().split(';')).find(([name]) => name.trim().toLowerCase() === 'gzip');
  const quality = gzipPreference?.slice(1).find(item => /^\s*q\s*=/i.test(item));
  const acceptsGzip = gzipPreference && (!quality || Number(quality.split('=')[1]) > 0);
  if (payload.length >= 16_384 && acceptsGzip) {
    gzip(payload, { level: 1 }, (error, compressed) => {
      if (res.destroyed) return;
      // A compression failure can safely fall back before response headers are sent.
      res.writeHead(status, error ? headers : { ...headers, 'content-encoding': 'gzip' });
      res.end(error ? payload : compressed);
    });
  } else {
    res.writeHead(status, headers);
    res.end(payload);
  }
}

async function body(req) {
  let text = '';
  for await (const chunk of req) {
    text += chunk;
    if (text.length > 128_000) { const error = new Error('Request is too large.'); error.status = 413; throw error; }
  }
  try {
    const input = JSON.parse(text || '{}');
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error();
    return input;
  }
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

function failure(message, status = 422) {
  throw Object.assign(new Error(message), { status });
}
function studentNumber(value) {
  if (typeof value !== 'string' || !/^\d{2}-\d{5}$/.test(value)) failure('Provide a valid student number.');
  return value;
}
function credentials(input) {
  studentNumber(input.id);
  if (typeof input.email !== 'string' || !input.email.trim() || input.email.length > 120 || typeof input.birth !== 'string' || !/^\d{2}\/\d{2}\/\d{4}$/.test(input.birth)) failure('Provide email and birth date.');
}
async function passwordHash(password) {
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) failure('Choose a password with at least 8 characters and at most 72 UTF-8 bytes.');
  return hash(password, 10);
}
async function passwordMatches(password, stored) {
  if (typeof stored === 'string' && /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) {
    const validPassword = typeof password === 'string' && password.length >= 8 && password.length <= 128;
    const [salt, expected] = stored.split(':');
    const actual = await deriveKey(validPassword ? password : '', salt, 64);
    return timingSafeEqual(actual, Buffer.from(expected, 'hex')) && validPassword;
  }
  const validPassword = typeof password === 'string' && password.length >= 8 && Buffer.byteLength(password, 'utf8') <= 72;
  const validHash = typeof stored === 'string' && /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(stored);
  // Unknown accounts still pay the bcrypt cost.
  const matches = await compare(validPassword ? password : '', validHash ? stored : dummyHash);
  return matches && validHash && validPassword;
}
function csv(rows) {
  const cell = value => {
    let text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value);
    if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))];
  return [keys.map(cell).join(','), ...rows.map(row => keys.map(key => cell(row[key])).join(','))].join('\r\n');
}

export function startServer(port = 3001, databasePath = resolve(root, 'data', 'registrar.sqlite'), options = {}) {
  const store = options.store || openStore(databasePath);
  const stopBackups = startDailyBackups(databasePath, () => console.error('Daily database backup failed. Run npm run backup and check storage permissions.'));
  const now = options.now || Date.now;
  const sessions = new Map();
  const idleTimeout = 8 * 60 * 60 * 1000;
  let loginAttempts = 0;
  let retryAfter = 0;
  const cookieName = options.practice ? 'registrar_practice_session' : 'registrar_session';
  const sessionPattern = new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`);
  const sessionId = req => sessionPattern.exec(req.headers.cookie || '')?.[1];
  const cookie = token => `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 28800 : 0}`;
  const actorFor = (req, res) => {
    const token = sessionId(req);
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expires <= now()) { sessions.delete(token); return null; }
    session.expires = now() + idleTimeout;
    res.setHeader('set-cookie', cookie(token));
    return { role: session.role, id: session.id };
  };
  const issueSession = (req, res, actor) => {
    sessions.delete(sessionId(req));
    for (const [token, session] of sessions) if (session.expires <= now()) sessions.delete(token);
    const token = randomBytes(32).toString('hex');
    sessions.set(token, { ...actor, expires: now() + idleTimeout });
    json(res, 200, { authenticated: true, ...actor }, { 'set-cookie': cookie(token) });
  };
  const staffPassword = role => store.staffPassword(role);
  const server = createServer(async (req, res) => {
    let publicRequest = false;
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname !== '/api' && !url.pathname.startsWith('/api/')) { await staticFile(req, res); return; }
      const path = url.pathname.replace(/^\/api(?:\/v1(?=\/|$))?/, '') || '/';
      publicRequest = path.startsWith('/public/') || path.startsWith('/auth/');
      if (!['GET','HEAD'].includes(req.method) && req.headers['x-registrar-request'] !== '1') failure('Request header is missing.', 403);
      const actor = actorFor(req, res);
      const requireRole = (...roles) => {
        if (!actor) failure('Login is required.', 401);
        if (!roles.includes(actor.role)) failure('Your role cannot perform this action.', 403);
      };
      if (path === '/public/config' && req.method === 'GET') {
        json(res, 200, { institution, programs, term: store.publicTerm() ?? null, practice: Boolean(options.practice) }); return;
      }
      if (path === '/auth/status' && req.method === 'GET') {
        json(res, 200, { configured: Boolean(staffPassword('registrar')), authenticated: Boolean(actor), role: actor?.role ?? null, id: actor?.id ?? null, departmentHeadConfigured: Boolean(staffPassword('department_head')) }); return;
      }
      if (path === '/auth/setup' && req.method === 'POST') {
        if (staffPassword('registrar')) failure('Registrar password is already configured.', 409);
        const password = await passwordHash((await body(req)).password);
        store.setRegistrarPassword(password);
        issueSession(req, res, { role: 'registrar', id: 'registrar' }); return;
      }
      if (path === '/auth/login' && req.method === 'POST') {
        if (now() >= retryAfter) { loginAttempts = 0; retryAfter = now() + 60_000; }
        if (loginAttempts >= 5) {
          json(res, 429, { error: 'Too many attempts. Try again in one minute.' }, { 'retry-after': String(Math.ceil((retryAfter - now()) / 1000)) }); return;
        }
        // Reserve attempts before async verification so concurrent requests share the limit.
        loginAttempts += 1;
        const { role = 'registrar', password, id } = await body(req);
        const validRole = ['registrar', 'department_head', 'student'].includes(role);
        const studentId = typeof id === 'string' && /^\d{2}-\d{5}$/.test(id) ? id : null;
        const currentPassword = () => role === 'student' ? (studentId ? store.studentPassword(studentId) : null) : validRole ? staffPassword(role) : null;
        const stored = currentPassword();
        if (!await passwordMatches(password, stored) || currentPassword() !== stored) {
          failure('Incorrect login credentials.', 401);
        }
        issueSession(req, res, { role, id: role === 'student' ? studentId : role }); return;
      }
      if (path === '/public/register' && req.method === 'POST') {
        const input = await body(req);
        if (input.consent !== true && input.privacyConsent !== true) failure('Privacy consent is required.');
        const hash = input.password === undefined ? null : await passwordHash(input.password);
        const { password, ...registration } = input;
        const result = store.registerStudent({ ...registration, consent: true });
        // Repeated registration must never become an account recovery path.
        if (hash && !result.existing) store.setStudentPassword(result.id, hash);
        json(res, 200, result); return;
      }
      if (path === '/public/account' && req.method === 'POST') {
        const input = await body(req);
        credentials(input);
        const hash = await passwordHash(input.password);
        const student = store.studentByCredentials(input.id, input.email, input.birth);
        if (!student) failure('Student record was not found with those details.', 404);
        if (store.studentPassword(student.id)) failure('Student password is already configured.', 409);
        store.setStudentPassword(student.id, hash);
        json(res, 200, { id: student.id, configured: true }); return;
      }
      if (path === '/public/student' && req.method === 'POST') {
        const input = await body(req);
        credentials(input);
        json(res, 200, store.limitedPublicStatus(input.id, input.email, input.birth)); return;
      }
      if (path === '/public/reset-password' && req.method === 'POST') {
        const input = await body(req);
        if (typeof input.token !== 'string' || !/^[a-f0-9]{64}$/.test(input.token)) failure('Provide a valid password reset link.');
        const password = await passwordHash(input.password);
        const account = store.redeemReset(createHash('sha256').update(input.token).digest('hex'), password);
        for (const [token, session] of sessions) if (session.role === account.role && session.id === account.id) sessions.delete(token);
        json(res, 200, { reset: true, role: account.role }); return;
      }
      if (!actor) failure('Login is required.', 401);
      if (path === '/auth/logout' && req.method === 'POST') {
        sessions.delete(sessionId(req));
        json(res, 200, { authenticated: false }, { 'set-cookie': cookie('') }); return;
      }
      if (path === '/me/grades' && req.method === 'GET') {
        requireRole('student');
        json(res, 200, store.studentGrades(actor.id)); return;
      }
      if (path === '/me' && req.method === 'GET') {
        requireRole('student');
        json(res, 200, store.studentView(actor.id)); return;
      }
      if (path === '/me/back-subjects' && req.method === 'POST') {
        requireRole('student');
        json(res, 200, store.chooseBackSubjects(actor.id, (await body(req)).codes, actor)); return;
      }
      const evaluationMatch = /^\/evaluation\/([^/]+)$/.exec(path);
      if (evaluationMatch && req.method === 'GET') {
        requireRole('registrar', 'department_head');
        json(res, 200, store.evaluation(studentNumber(decodeURIComponent(evaluationMatch[1])), actor)); return;
      }
      if (path === '/me/respond' && req.method === 'POST') {
        requireRole('student');
        const { status, revision } = await body(req);
        if (!['accepted', 'declined'].includes(status) || !Number.isInteger(revision) || revision < 1) failure('Choose accepted or declined and provide a valid plan revision.');
        json(res, 200, store.respondPlan(actor.id, status, revision, actor)); return;
      }
      if (path === '/data' && req.method === 'GET') {
        requireRole('registrar', 'department_head');
        json(res, 200, store.list(actor)); return;
      }
      if (path === '/assignments' && req.method === 'POST') {
        requireRole('registrar', 'department_head');
        const input = await body(req);
        studentNumber(input.studentId);
        json(res, 200, store.assignSubjects(input.studentId, input.codes, actor)); return;
      }
      if (path === '/reports' && req.method === 'GET') {
        requireRole('registrar', 'department_head');
        const filters = Object.fromEntries(['term','program','status'].filter(key => url.searchParams.has(key)).map(key => [key, url.searchParams.get(key)]));
        const rows = store.reports(filters, actor);
        if (url.searchParams.get('format') === 'csv') {
          res.writeHead(200, { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="enrollment-report.csv"', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
          res.end(csv(rows));
        } else json(res, 200, rows);
        return;
      }
      if (path === '/audit' && req.method === 'GET') {
        requireRole('registrar', 'department_head');
        json(res, 200, store.auditHistory(actor)); return;
      }
      requireRole('registrar');
      if (path === '/blocks' && req.method === 'POST') { json(res,201,store.createBlock(await body(req),actor)); return; }
      if (path === '/block-terms' && req.method === 'POST') { json(res,201,store.createBlockTerm(await body(req),actor)); return; }
      const membershipMatch=/^\/students\/([^/]+)\/block$/.exec(path);
      if (membershipMatch && req.method === 'POST') { json(res,200,store.assignHomeBlock(studentNumber(decodeURIComponent(membershipMatch[1])),await body(req),actor)); return; }
      const blockClassMatch=/^\/block-terms\/(\d+)\/classes$/.exec(path);
      if (blockClassMatch && req.method === 'POST') { json(res,201,store.addBlockClass(Number(blockClassMatch[1]),await body(req),actor)); return; }
      const blockLinkMatch=/^\/block-terms\/(\d+)\/link$/.exec(path);
      if (blockLinkMatch && req.method === 'POST') { json(res,201,store.linkBlockClass(Number(blockLinkMatch[1]),(await body(req)).sectionId,actor)); return; }
      if (path === '/blocks/offer' && req.method === 'POST') { const input=await body(req); json(res,201,store.offerBlockPlan(studentNumber(input.studentId),input.blockTermId,actor)); return; }
      if (path === '/resources' && req.method === 'POST') {
        json(res, 201, store.addResource(await body(req), actor)); return;
      }
      const resultsMatch = /^\/students\/([^/]+)\/results$/.exec(path);
      if (resultsMatch && req.method === 'POST') {
        json(res, 200, store.recordResults(studentNumber(decodeURIComponent(resultsMatch[1])), (await body(req)).rows, actor)); return;
      }
      if (path === '/recovery' && req.method === 'POST') {
        const input = await body(req);
        if (input.identityVerified !== true || typeof input.reason !== 'string' || input.reason.trim().length < 3 || input.reason.length > 240) failure('Confirm school-approved identity verification and enter a verification reference (3 to 240 characters).');
        const token = randomBytes(32).toString('hex');
        const issued = store.issueReset(input.role, input.target, createHash('sha256').update(token).digest('hex'), actor, input.reason.trim());
        json(res, 201, { ...issued, resetUrl: '/student.html?view=reset#token=' + token }); return;
      }
      if (path === '/staff/department-head' && req.method === 'POST') {
        if (staffPassword('department_head')) failure('Department Head access is already configured. Use verified account recovery to reset it.', 409);
        store.setStaffPassword('department_head', await passwordHash((await body(req)).password), { initial: true });
        for (const [token, session] of sessions) if (session.role === 'department_head') sessions.delete(token);
        json(res, 200, { configured: true }); return;
      }
      const reviewMatch = /^\/students\/([^/]+)\/review$/.exec(path);
      if (reviewMatch && req.method === 'POST') { json(res, 200, store.reviewStudent(decodeURIComponent(reviewMatch[1]), actor)); return; }
      if (path === '/terms' && req.method === 'POST') { json(res, 201, store.createTerm(await body(req), actor)); return; }
      const termMatch = /^\/terms\/([^/]+)\/activate$/.exec(path);
      if (termMatch && req.method === 'POST') { json(res, 200, store.activateTerm(decodeURIComponent(termMatch[1]), actor)); return; }
      if (path === '/import' && req.method === 'POST') { json(res, 200, store.importData(await body(req), actor)); return; }
      if (path === '/students' && req.method === 'POST') { json(res, 201, store.addStudent(await body(req), actor)); return; }
      const completedMatch = /^\/students\/([^/]+)\/completed-subjects$/.exec(path);
      if (completedMatch && req.method === 'POST') { json(res, 201, store.completeSubject(decodeURIComponent(completedMatch[1]), (await body(req)).code, actor)); return; }
      const studentMatch = /^\/students\/([^/]+)$/.exec(path);
      if (studentMatch && req.method === 'PUT') { json(res, 200, store.updateStudent(decodeURIComponent(studentMatch[1]), await body(req), actor)); return; }
      if (path === '/sections' && req.method === 'POST') { json(res, 201, store.addSection(await body(req), actor)); return; }
      if (path === '/curriculum/import-2022' && req.method === 'POST') { json(res, 200, store.importCurriculum(plpCurriculum2022, actor)); return; }
      if (path === '/curriculum' && req.method === 'POST') { json(res, 201, store.addCurriculum(await body(req), actor)); return; }
      if (['/enrollments', '/enrollments/confirm', '/enrollments/offer'].includes(path) && req.method === 'POST') {
        const input = await body(req);
        studentNumber(input.studentId);
        if (path === '/enrollments' && (typeof input.sectionId !== 'string' || !input.sectionId.trim())) failure('Choose a section.');
        if (path !== '/enrollments' && (!Array.isArray(input.sectionIds) || input.sectionIds.some(id => typeof id !== 'string'))) failure('Choose sections.');
        json(res, 201, store.offerPlan(input.studentId, path === '/enrollments' ? [input.sectionId] : input.sectionIds, actor)); return;
      }
      const confirmMatch = /^\/enrollments\/([^/]+)\/confirm$/.exec(path);
      if (confirmMatch && req.method === 'POST') { json(res, 200, store.confirmPlan(decodeURIComponent(confirmMatch[1]), actor)); return; }
      if (path === '/enrollments' && req.method === 'DELETE') {
        const input = await body(req);
        studentNumber(input.studentId);
        if (typeof input.sectionId !== 'string' || !input.sectionId.trim()) failure('Choose a section.');
        store.drop(input.studentId, input.sectionId, actor);
        json(res, 200, { ok: true }); return;
      }
      json(res, 404, { error: 'This route does not exist.' });
    } catch (error) {
      const status = error.status === 400 || error instanceof URIError ? 422 : error.status || (String(error.message).includes('UNIQUE constraint') ? 409 : 500);
      json(res, status, { error: status === 500 ? 'Server error.' : error.message });
      // Never log public inputs or DB errors that could contain student details.
      if (status === 500 && !publicRequest) console.error('HTTP request failed.');
    }
  });
  server.listen(port, '127.0.0.1');
  server.on('close', () => { stopBackups(); store.close(); });
  return server;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const port = Number(process.env.PORT || 3001);
  startServer(port);
  console.log(`Registrar server ready at http://127.0.0.1:${port}`);
}
