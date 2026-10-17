import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from './db.js';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const registrar = { role: 'registrar', id: 'registrar' };
const head = { role: 'department_head', id: 'department_head' };
const person = { first: 'Test', last: 'Learner', birth: '01/02/2008', gender: 'Unspecified', address: 'Sample address', phone: '0000000', email: 'learner@example.test', program: 'BS Information Technology', level: '1st year', admitted: '10/01/2026', semester: 1, consent: true };
const subject = { code: 'IT101', title: 'Sample foundations', units: 3, program: person.program, yearLevel: 1, semester: 1 };
const section = { ...subject, section: 'A', instructor: 'Sample instructor', room: 'Sample room', day: 'Monday', start: '09:00', end: '10:00', capacity: 1 };

function fixture(studentType = 'regular') {
  const store = openStore(':memory:');
  const student = store.addStudent({ ...person, studentType }, registrar);
  store.addCurriculum(subject, registrar);
  const scheduled = store.addSection(section, registrar);
  return { store, student, scheduled, actor: { role: 'student', id: student.id } };
}

test('regular enrollment requires student acceptance before registrar confirmation and records actors', () => {
  const { store, student, scheduled, actor } = fixture();
  try {
    const offer = store.offerPlan(student.id, [scheduled.id], registrar);
    assert.equal(offer.status, 'pending');
    assert.throws(() => store.confirmPlan(student.id, registrar), /must accept/);
    assert.throws(() => store.respondPlan(student.id, 'confirmed', offer.revision, actor), /accepted or declined/);
    assert.throws(() => store.respondPlan(student.id, 'accepted', offer.revision, { role: 'student', id: 'other' }), /own enrollment/);
    assert.throws(() => store.respondPlan(student.id, 'accepted', offer.revision - 1, actor), /changed/);
    assert.equal(store.respondPlan(student.id, 'accepted', offer.revision, actor).status, 'accepted');
    assert.equal(store.respondPlan(student.id, 'accepted', offer.revision, actor).status, 'accepted');
    assert.equal(store.confirmPlan(student.id, registrar).status, 'confirmed');
    assert.equal(store.confirmPlan(student.id, registrar).status, 'confirmed');
    assert.throws(() => store.drop(student.id, scheduled.id, registrar), /cannot be changed/);
    assert.throws(() => store.respondPlan(student.id, 'declined', offer.revision, actor), /pending offer/);
    assert.deepEqual(store.auditHistory(registrar).filter(row => ['offer', 'accepted', 'confirm'].includes(row.action)).map(row => row.actor), ['registrar:registrar', `student:${student.id}`, 'registrar:registrar']);
    assert.equal(store.studentView(student.id).classes.length, 1);
  } finally { store.close(); }
});

test('decline releases reserved seat and stale responses cannot accept a replacement offer', () => {
  const { store, student, scheduled, actor } = fixture();
  try {
    const other = store.addStudent({ ...person, first: 'Another', email: 'another@example.test' }, registrar);
    const offer = store.offerPlan(student.id, [scheduled.id], registrar);
    assert.throws(() => store.offerPlan(other.id, [scheduled.id], registrar), /available section/);
    assert.equal(store.list().plans.length, 1);
    store.respondPlan(student.id, 'declined', offer.revision, actor);
    assert.equal(store.list().enrollments.length, 0);
    assert.equal(store.studentView(student.id).classes.length, 0);
    const replacement = store.offerPlan(student.id, [scheduled.id], registrar);
    assert.ok(replacement.revision > offer.revision);
    assert.throws(() => store.respondPlan(student.id, 'accepted', offer.revision, actor), /changed/);
    store.respondPlan(student.id, 'declined', replacement.revision, actor);
    store.offerPlan(other.id, [scheduled.id], registrar);
    assert.equal(store.list().enrollments.length, 1);
  } finally { store.close(); }
});

test('special-case subjects belong to Department Head and scheduling belongs to Registrar', () => {
  const { store, student, scheduled, actor } = fixture('transferee');
  try {
    const regular = store.addStudent({ ...person, first: 'Regular', email: 'regular@example.test' }, registrar);
    assert.throws(() => store.assignSubjects(regular.id, [subject.code], head), /Only the Registrar/);
    assert.throws(() => store.offerPlan(student.id, [scheduled.id], registrar), /Only the Department Head/);
    const assigned = store.assignSubjects(student.id, [subject.code], head);
    assert.equal(assigned.status, 'draft');
    assert.throws(() => store.offerPlan(student.id, [scheduled.id], head), /Only the Registrar/);
    const offer = store.offerPlan(student.id, [scheduled.id], registrar);
    store.respondPlan(student.id, 'declined', offer.revision, actor);
    assert.throws(() => store.offerPlan(student.id, [scheduled.id], registrar), /Only the Department Head/);
    assert.deepEqual(store.list(head).students.map(row => row.id), [student.id]);
    assert.ok(store.auditHistory(head).every(row => row.entityId.startsWith(student.id)));
    assert.equal(store.reports({}, head).length, 1);
    assert.throws(() => store.confirmPlan(student.id, head), /Only the Registrar/);
  } finally { store.close(); }
});

test('curriculum enforces year, semester, prerequisite completion, and cycles', () => {
  const { store, student } = fixture();
  try {
    store.addCurriculum({ ...subject, code: 'IT201', title: 'Sample advanced', yearLevel: 2, prerequisites: 'IT101' }, registrar);
    store.addSection({ ...section, code: 'IT201', title: 'Sample advanced', day: 'Tuesday', prerequisites: 'IT101' }, registrar);
    assert.throws(() => store.addCurriculum({ ...subject, prerequisites: 'IT201' }, registrar), /cycle/);
    assert.throws(() => store.assignSubjects(student.id, ['IT201'], registrar), /applicable curriculum/);
    const special = store.addStudent({ ...person, first: 'Returning', email: 'returning@example.test', studentType: 'returning' }, registrar);
    assert.throws(() => store.assignSubjects(special.id, ['IT201'], head), /Prerequisite not completed/);
    store.completeSubject(special.id, 'IT101', registrar);
    assert.equal(store.assignSubjects(special.id, ['IT201'], head).status, 'draft');
    assert.throws(() => store.addCurriculum({ ...subject, code: 'IT201', title: 'Sample advanced' }, registrar), /used by an enrollment/);
    assert.throws(() => store.addCurriculum({ ...subject, yearLevel: 5 }, registrar), /year 1/);
  } finally { store.close(); }
});

test('offers are atomic when chosen sections conflict and reject duplicate subjects', () => {
  const { store, student, scheduled } = fixture();
  try {
    store.addCurriculum({ ...subject, code: 'IT102', title: 'Sample programming' }, registrar);
    const clash = store.addSection({ ...section, code: 'IT102', title: 'Sample programming', room: 'Other room', instructor: 'Other instructor', start: '09:30', end: '10:30' }, registrar);
    assert.throws(() => store.offerPlan(student.id, [scheduled.id, clash.id], registrar), /conflicts/);
    assert.equal(store.list().enrollments.length, 0);
    assert.equal(store.list().plans.length, 0);
    const duplicate = store.addSection({ ...section, section: 'B', day: 'Wednesday' }, registrar);
    assert.throws(() => store.offerPlan(student.id, [scheduled.id, duplicate.id], registrar), /distinct subjects/);
    assert.equal(store.list().plans.length, 0);
  } finally { store.close(); }
});

test('room and instructor conflicts are blocked and academic dates are validated', () => {
  const { store } = fixture();
  try {
    assert.throws(() => store.addSection({ ...section, section: 'B' }, registrar), /Room or instructor/);
    assert.throws(() => store.addSection({ ...section, section: 'B', day: 'Wednesday', startDate: '2026-02-30', endDate: '2026-03-30' }, registrar), /valid academic dates/);
    assert.throws(() => store.addSection({ ...section, section: 'B', day: 'Wednesday', startDate: '2026-12-01', endDate: '2026-10-01' }, registrar), /end date/);
  } finally { store.close(); }
});

test('public lookup contains no schedule or sensitive flags and student account cannot be overwritten', () => {
  const { store, student, scheduled } = fixture('accessible_learning');
  try {
    store.assignSubjects(student.id, [subject.code], head);
    store.offerPlan(student.id, [scheduled.id], registrar);
    const lookup = store.limitedPublicStatus(student.id, person.email, person.birth);
    assert.deepEqual(Object.keys(lookup).sort(), ['hasAccount', 'id', 'reviewed', 'term', 'updatedAt']);
    store.setStudentPassword(student.id, 'sample-hash');
    assert.throws(() => store.setStudentPassword(student.id, 'replacement'), /already configured/);
    assert.equal(store.studentPassword(student.id), 'sample-hash');
    assert.throws(() => store.studentByCredentials(student.id, 'other@example.test', person.birth), /not found/);
    assert.ok(!JSON.stringify(store.studentView(student.id)).includes('accessible_learning'));
  } finally { store.close(); }
});

test('calendar year rollover resets the sequence and preserves existing permanent IDs', () => {
  let current = new Date('2026-12-31T15:59:59Z');
  const store = openStore(':memory:', { now: () => current });
  try {
    const old = store.addStudent(person, registrar);
    current = new Date('2026-12-31T16:00:00Z');
    const next = store.addStudent({ ...person, first: 'Next', email: 'next@example.test' }, registrar);
    assert.equal(old.id, '26-00001');
    assert.equal(next.id, '27-00001');
    assert.equal(store.list().students[0].id, old.id);
  } finally { store.close(); }
});

test('version 4 migration preserves student IDs, credentials, and confirmed historical schedules', () => {
  const folder = mkdtempSync(join(tmpdir(), 'enrollment-migration-'));
  const path = join(folder, 'legacy.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE students(id INTEGER PRIMARY KEY,number TEXT NOT NULL UNIQUE,first TEXT,last TEXT,email TEXT UNIQUE,program TEXT,level TEXT,admitted TEXT,status TEXT,created_by INTEGER,updated_at TEXT,birth TEXT,gender TEXT,address TEXT,phone TEXT,reviewed_at TEXT);
    CREATE TABLE subjects(id INTEGER PRIMARY KEY,code TEXT UNIQUE,title TEXT);
    CREATE TABLE terms(id TEXT PRIMARY KEY,label TEXT,active INTEGER);
    CREATE TABLE sections(id INTEGER PRIMARY KEY,public_id TEXT UNIQUE,subject_id INTEGER REFERENCES subjects(id),term_id TEXT REFERENCES terms(id),label TEXT,instructor TEXT,day TEXT,start TEXT,end TEXT,room TEXT,capacity INTEGER);
    CREATE TABLE enrollments(student_id INTEGER REFERENCES students(id),section_id INTEGER REFERENCES sections(id),created_by INTEGER,created_at TEXT,PRIMARY KEY(student_id,section_id));
    CREATE TABLE audit_log(id INTEGER PRIMARY KEY,actor_id INTEGER,action TEXT,entity TEXT,entity_id TEXT,at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE subject_prerequisites(subject_id INTEGER REFERENCES subjects(id),prerequisite_id INTEGER REFERENCES subjects(id),PRIMARY KEY(subject_id,prerequisite_id));
    CREATE TABLE completed_subjects(student_id INTEGER REFERENCES students(id),subject_id INTEGER REFERENCES subjects(id),PRIMARY KEY(student_id,subject_id));
    CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
    INSERT INTO students(id,number,first,last,email,program,level,status,birth,reviewed_at) VALUES(10,'25-00123','Legacy','Sample','legacy@example.test','Sample program','1st year','Active','01/01/2008','2025-10-01');
    INSERT INTO subjects VALUES(20,'LEG101','Legacy sample subject');
    INSERT INTO terms VALUES('2025-1','Sample legacy semester',1);
    INSERT INTO sections VALUES(30,'SEC-030',20,'2025-1','A','Sample instructor','Monday','09:00','10:00','Sample room',30);
    INSERT INTO enrollments VALUES(10,30,NULL,'2025-10-01');
    INSERT INTO settings VALUES('registrar_password','legacy-sample-hash');
    PRAGMA user_version=4;
  `);
  legacy.close();
  let store;
  try {
    store = openStore(path);
    assert.equal(store.list().students[0].id, '25-00123');
    assert.equal(store.registrarPassword(), 'legacy-sample-hash');
    const view = store.studentView('25-00123');
    assert.equal(view.plan.status, 'confirmed');
    assert.equal(view.classes[0].code, 'LEG101');
    assert.equal(store.list().plans[0].assignedBy, 'legacy:registrar');
    assert.equal(store.list().enrollments.length, 1);
    store.close();
    store = openStore(path);
    assert.equal(store.studentView('25-00123').classes.length, 1);
  } finally { store?.close(); rmSync(folder, { recursive: true, force: true }); }
});
