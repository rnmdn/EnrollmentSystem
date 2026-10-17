import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openStore } from './db.js';

test('legacy user foreign keys preserve historical actors while role sessions create and allocate new records', () => {
  const folder = mkdtempSync(join(tmpdir(), 'enrollment-legacy-actors-'));
  const path = join(folder, 'legacy.sqlite');
  const legacy = new DatabaseSync(path);
  legacy.exec(`
    CREATE TABLE users(id INTEGER PRIMARY KEY);
    INSERT INTO users VALUES(1);
    CREATE TABLE students(id INTEGER PRIMARY KEY,number TEXT NOT NULL UNIQUE,first TEXT,last TEXT,email TEXT UNIQUE,program TEXT,level TEXT,admitted TEXT,status TEXT,created_by INTEGER REFERENCES users(id),updated_at TEXT,birth TEXT,gender TEXT,address TEXT,phone TEXT,reviewed_at TEXT);
    CREATE TABLE subjects(id INTEGER PRIMARY KEY,code TEXT UNIQUE,title TEXT);
    CREATE TABLE terms(id TEXT PRIMARY KEY,label TEXT,active INTEGER);
    CREATE TABLE sections(id INTEGER PRIMARY KEY,public_id TEXT UNIQUE,subject_id INTEGER REFERENCES subjects(id),term_id TEXT REFERENCES terms(id),label TEXT,instructor TEXT,day TEXT,start TEXT,end TEXT,room TEXT,capacity INTEGER);
    CREATE TABLE enrollments(student_id INTEGER REFERENCES students(id),section_id INTEGER REFERENCES sections(id),created_by INTEGER REFERENCES users(id),created_at TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(student_id,section_id));
    CREATE TABLE audit_log(id INTEGER PRIMARY KEY,actor_id INTEGER REFERENCES users(id),action TEXT,entity TEXT,entity_id TEXT,at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE subject_prerequisites(subject_id INTEGER REFERENCES subjects(id),prerequisite_id INTEGER REFERENCES subjects(id),PRIMARY KEY(subject_id,prerequisite_id));
    CREATE TABLE completed_subjects(student_id INTEGER REFERENCES students(id),subject_id INTEGER REFERENCES subjects(id),PRIMARY KEY(student_id,subject_id));
    CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
    INSERT INTO terms VALUES('2026-1','Example semester',1);
    INSERT INTO students(id,number,first,last,email,program,level,status,birth,reviewed_at,created_by) VALUES(10,'25-00123','Legacy','Sample','legacy@example.test','BS Information Technology','1st year','Active','01/01/2008','2025-10-01',1);
    INSERT INTO audit_log(actor_id,action,entity,entity_id) VALUES(1,'create','student','25-00123');
    PRAGMA user_version=4;
  `);
  legacy.close();
  const store = openStore(path);
  try {
    const actor = {role:'registrar',id:'registrar'};
    const student = store.addStudent({first:'New',last:'Example',birth:'01/01/2008',gender:'Unspecified',address:'Example address',phone:'0000000',email:'new@example.test',program:'BS Information Technology',level:'1st year',admitted:'10/01/2026'}, actor);
    const subject = {code:'EX101',title:'Example subject',units:3,program:student.program,yearLevel:1,semester:1};
    store.addCurriculum(subject,actor);
    const section = store.addSection({...subject,section:'A',instructor:'Example professor',room:'Example room',capacity:2,day:'Monday',start:'09:00',end:'10:00'},actor);
    store.offerPlan(student.id,[section.id],actor);
    assert.equal(store.list(actor).students[0].id,'25-00123');
    assert.equal(store.list(actor).enrollments.length,1);
    const audit = store.auditHistory(actor);
    assert.ok(audit.some(row=>String(row.actor)==='1'));
    assert.ok(audit.some(row=>row.actor==='registrar:registrar'));
    const inspect = new DatabaseSync(path,{readOnly:true});
    try { assert.deepEqual(inspect.prepare('PRAGMA foreign_key_check').all(),[]); }
    finally { inspect.close(); }
  } finally {
    store.close();
    rmSync(folder,{recursive:true,force:true});
  }
});
