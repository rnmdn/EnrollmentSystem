import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

function failure(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function required(value, label, max = 120) {
  const text = String(value ?? '').trim();
  if (!text || text.length > max) failure(`${label} is required and must be at most ${max} characters.`);
  return text;
}

function admissionDate(value) {
  const text = required(value, 'Admission date', 10);
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) failure('Enter an admission date as MM/DD/YYYY.');
  const parsed = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
  if (parsed.getFullYear() !== Number(match[3]) || parsed.getMonth() !== Number(match[1]) - 1 || parsed.getDate() !== Number(match[2]) || parsed > new Date()) failure('Enter a valid admission date that is not in the future.');
  return text;
}

function validateStudent(input) {
  const email = required(input.email, 'Email', 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) failure('Enter a valid email address.');
  const status = input.status === 'Inactive' ? 'Inactive' : 'Active';
  return { first: required(input.first, 'First name', 60), last: required(input.last, 'Last name', 60), email, program: required(input.program, 'Program', 100), level: required(input.level, 'Year level', 30), admitted: admissionDate(input.admitted), status };
}

function validateSection(input) {
  const start = required(input.start, 'Start time', 5);
  const end = required(input.end, 'End time', 5);
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(end) || start >= end) failure('Enter a valid meeting time with the end after the start.');
  const day = required(input.day, 'Meeting day', 10);
  if (!['Monday','Tuesday','Wednesday','Thursday','Friday'].includes(day)) failure('Choose a weekday.');
  const capacity = Number(input.capacity);
  if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) failure('Capacity must be between 1 and 500.');
  return { code: required(input.code, 'Subject code', 20).toUpperCase(), title: required(input.title, 'Subject title', 100), section: required(input.section, 'Section name', 15).toUpperCase(), instructor: required(input.instructor, 'Instructor', 100), room: required(input.room, 'Room', 40), day, start, end, capacity };
}

export function openStore(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  if (db.prepare('PRAGMA user_version').get().user_version === 0) {
    db.exec(`
      BEGIN;
      CREATE TABLE students (id INTEGER PRIMARY KEY, number TEXT NOT NULL UNIQUE, first TEXT NOT NULL, last TEXT NOT NULL, email TEXT NOT NULL UNIQUE, program TEXT NOT NULL, level TEXT NOT NULL, admitted TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('Active','Inactive')), created_by INTEGER, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE subjects (id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, title TEXT NOT NULL);
      CREATE TABLE terms (id TEXT PRIMARY KEY, label TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE sections (id INTEGER PRIMARY KEY, public_id TEXT NOT NULL UNIQUE, subject_id INTEGER NOT NULL REFERENCES subjects(id), term_id TEXT NOT NULL REFERENCES terms(id), label TEXT NOT NULL, instructor TEXT NOT NULL, day TEXT NOT NULL, start TEXT NOT NULL, end TEXT NOT NULL, room TEXT NOT NULL, capacity INTEGER NOT NULL CHECK (capacity BETWEEN 1 AND 500), UNIQUE (subject_id, term_id, label));
      CREATE TABLE enrollments (student_id INTEGER NOT NULL REFERENCES students(id), section_id INTEGER NOT NULL REFERENCES sections(id), created_by INTEGER, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (student_id, section_id));
      CREATE TABLE audit_log (id INTEGER PRIMARY KEY, actor_id INTEGER, action TEXT NOT NULL, entity TEXT NOT NULL, entity_id TEXT NOT NULL, at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
      INSERT INTO terms (id, label, active) VALUES ('2026-1', '2026–2027 · Semester 1', 1);
      PRAGMA user_version = 1;
      COMMIT;
    `);
  }
  // Older local databases already contain the first term. No data rewrite is needed.
  if (db.prepare('PRAGMA user_version').get().user_version === 1) db.exec('PRAGMA user_version = 2');

  function activeTerm() {
    return db.prepare('SELECT id, label FROM terms WHERE active = 1 LIMIT 1').get();
  }

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function audit(actor, action, entity, id) {
    db.prepare('INSERT INTO audit_log (actor_id, action, entity, entity_id) VALUES (?, ?, ?, ?)').run(actor, action, entity, String(id));
  }
  function list() {
    const term = activeTerm();
    const terms = db.prepare(`SELECT terms.id, terms.label, terms.active, COUNT(DISTINCT sections.id) AS sections, COUNT(enrollments.student_id) AS enrollments
      FROM terms LEFT JOIN sections ON sections.term_id = terms.id LEFT JOIN enrollments ON enrollments.section_id = sections.id
      GROUP BY terms.id ORDER BY terms.id DESC`).all();
    const students = db.prepare('SELECT number AS id, first, last, email, program, level, admitted, status FROM students ORDER BY id').all();
    const sections = db.prepare('SELECT sections.public_id AS id, subjects.code, subjects.title, sections.label AS section, sections.instructor, sections.day, sections.start, sections.end, sections.room, sections.capacity FROM sections JOIN subjects ON subjects.id = sections.subject_id WHERE sections.term_id = ? ORDER BY sections.id').all(term.id);
    const enrollments = db.prepare('SELECT students.number AS studentId, sections.public_id AS sectionId FROM enrollments JOIN students ON students.id = enrollments.student_id JOIN sections ON sections.id = enrollments.section_id WHERE sections.term_id = ? ORDER BY enrollments.created_at').all(term.id);
    return { term, terms, students, sections, enrollments };
  }
  function createTerm(input, actor) {
    const year = Number(input.year);
    const semester = Number(input.semester);
    if (!Number.isInteger(year) || year < 2000 || year > 2099) failure('Choose a starting year from 2000 to 2099.');
    if (![1, 2, 3].includes(semester)) failure('Choose Semester 1, Semester 2, or Summer.');
    const id = `${year}-${semester}`;
    const label = `${year}–${year + 1} · ${semester === 3 ? 'Summer' : `Semester ${semester}`}`;
    return transaction(() => {
      if (db.prepare('SELECT 1 FROM terms WHERE id = ?').get(id)) failure('This academic term already exists.', 409);
      db.prepare('UPDATE terms SET active = 0').run();
      db.prepare('INSERT INTO terms (id, label, active) VALUES (?, ?, 1)').run(id, label);
      audit(actor, 'create', 'term', id);
      return { id, label, active: 1 };
    });
  }
  function activateTerm(id, actor) {
    return transaction(() => {
      const term = db.prepare('SELECT id, label FROM terms WHERE id = ?').get(id);
      if (!term) failure('Academic term was not found.', 404);
      db.prepare('UPDATE terms SET active = 0').run();
      db.prepare('UPDATE terms SET active = 1 WHERE id = ?').run(id);
      audit(actor, 'activate', 'term', id);
      return { ...term, active: 1 };
    });
  }
  function addStudent(input, actor) {
    const student = validateStudent(input);
    return transaction(() => {
      const year = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', year: '2-digit' }).format(new Date());
      const max = db.prepare("SELECT MAX(CAST(SUBSTR(number, 4) AS INTEGER)) AS value FROM students WHERE number LIKE ?").get(`${year}-%`).value || 0;
      if (max >= 99999) failure(`Student number sequence for ${year} is full.`, 409);
      const number = `${year}-${String(max + 1).padStart(5, '0')}`;
      db.prepare('INSERT INTO students (number, first, last, email, program, level, admitted, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(number, student.first, student.last, student.email, student.program, student.level, student.admitted, student.status, actor);
      audit(actor, 'create', 'student', number);
      return { id: number, ...student };
    });
  }
  function updateStudent(number, input, actor) {
    const student = validateStudent(input);
    return transaction(() => {
      const result = db.prepare('UPDATE students SET first=?, last=?, email=?, program=?, level=?, admitted=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE number=?').run(student.first, student.last, student.email, student.program, student.level, student.admitted, student.status, number);
      if (!result.changes) failure('Student record was not found.', 404);
      audit(actor, 'update', 'student', number);
      return { id: number, ...student };
    });
  }
  function subjectId(code, title) {
    const existing = db.prepare('SELECT id, title FROM subjects WHERE code = ?').get(code);
    if (existing) {
      if (existing.title.toLowerCase() !== title.toLowerCase()) failure(`Subject ${code} already has a different title.`, 409);
      return existing.id;
    }
    return db.prepare('INSERT INTO subjects (code, title) VALUES (?, ?)').run(code, title).lastInsertRowid;
  }
  function addSection(input, actor) {
    const section = validateSection(input);
    return transaction(() => {
      const subject = subjectId(section.code, section.title);
      const max = db.prepare("SELECT MAX(CAST(SUBSTR(public_id, 5) AS INTEGER)) AS value FROM sections").get().value || 0;
      const id = `SEC-${String(max + 1).padStart(3, '0')}`;
      db.prepare('INSERT INTO sections (public_id, subject_id, term_id, label, instructor, day, start, end, room, capacity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, subject, activeTerm().id, section.section, section.instructor, section.day, section.start, section.end, section.room, section.capacity);
      audit(actor, 'create', 'section', id);
      return { id, ...section };
    });
  }
  function insertAllocation(studentNumber, sectionPublicId, actor) {
      const student = db.prepare('SELECT id, status FROM students WHERE number = ?').get(studentNumber);
      if (!student || student.status !== 'Active') failure('Choose an active student.', 400);
      const section = db.prepare('SELECT id, term_id, day, start, end, capacity FROM sections WHERE public_id = ?').get(sectionPublicId);
      if (!section) failure('Choose a section.', 404);
      if (section.term_id !== activeTerm().id) failure('Choose a section in the active term.', 409);
      if (db.prepare('SELECT 1 FROM enrollments WHERE student_id = ? AND section_id = ?').get(student.id, section.id)) failure('Student is already allocated to this section.', 409);
      const occupied = db.prepare('SELECT COUNT(*) AS value FROM enrollments WHERE section_id = ?').get(section.id).value;
      if (occupied >= section.capacity) failure('This section has no available seats.', 409);
      const conflict = db.prepare('SELECT 1 FROM enrollments JOIN sections ON sections.id = enrollments.section_id WHERE enrollments.student_id = ? AND sections.term_id = ? AND sections.day = ? AND sections.start < ? AND ? < sections.end LIMIT 1').get(student.id, section.term_id, section.day, section.end, section.start);
      if (conflict) failure('This section conflicts with another class in the student schedule.', 409);
      db.prepare('INSERT INTO enrollments (student_id, section_id, created_by) VALUES (?, ?, ?)').run(student.id, section.id, actor);
      audit(actor, 'allocate', 'section', `${studentNumber}:${sectionPublicId}`);
      return { studentId: studentNumber, sectionId: sectionPublicId };
  }
  function allocate(studentNumber, sectionPublicId, actor) { return transaction(() => insertAllocation(studentNumber, sectionPublicId, actor)); }
  function drop(studentNumber, sectionPublicId, actor) {
    return transaction(() => {
      const result = db.prepare('DELETE FROM enrollments WHERE student_id = (SELECT id FROM students WHERE number = ?) AND section_id = (SELECT id FROM sections WHERE public_id = ? AND term_id = ?)').run(studentNumber, sectionPublicId, activeTerm().id);
      if (!result.changes) failure('Allocation was not found.', 404);
      audit(actor, 'remove', 'section', `${studentNumber}:${sectionPublicId}`);
    });
  }
  function importData(input, actor) {
    if (!Array.isArray(input.students) || !Array.isArray(input.sections) || !Array.isArray(input.enrollments) || input.students.length > 1000 || input.sections.length > 1000) failure('Browser data format is invalid.');
    return transaction(() => {
      if (db.prepare('SELECT 1 FROM students LIMIT 1').get() || db.prepare('SELECT 1 FROM sections LIMIT 1').get()) failure('Database already contains records.', 409);
      for (const item of input.students) {
        const student = validateStudent(item);
        if (!/^\d{2}-\d{5}$/.test(item.id)) failure('A student number in browser data is invalid.');
        db.prepare('INSERT INTO students (number, first, last, email, program, level, admitted, status, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(item.id, student.first, student.last, student.email, student.program, student.level, student.admitted, student.status, actor);
      }
      for (const item of input.sections) {
        const section = validateSection(item);
        if (!/^SEC-\d+$/.test(item.id)) failure('A section ID in browser data is invalid.');
        const subject = subjectId(section.code, section.title);
        db.prepare('INSERT INTO sections (public_id, subject_id, term_id, label, instructor, day, start, end, room, capacity) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(item.id, subject, activeTerm().id, section.section, section.instructor, section.day, section.start, section.end, section.room, section.capacity);
      }
      for (const item of input.enrollments) {
        insertAllocation(item.studentId, item.sectionId, actor);
      }
      audit(actor, 'import', 'browser_data', `${input.students.length} students`);
      return { imported: true };
    });
  }
  return { close: () => db.close(), list, createTerm, activateTerm, addStudent, updateStudent, addSection, allocate, drop, importData };
}
