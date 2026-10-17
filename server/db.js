import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { evaluateGrade } from '../grade.js';
import { programs as schoolPrograms } from '../institution.js';

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

const studentTypes = ['regular', 'back_subject', 'transferee', 'returning', 'academic_recovery', 'accessible_learning'];
const actorId = actor => actor && typeof actor === 'object' ? `${actor.role}:${actor.id}` : actor;

function manilaDate(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: '2-digit', day: '2-digit', year: 'numeric' }).formatToParts(value);
  const part = type => parts.find(item => item.type === type).value;
  return `${part('month')}/${part('day')}/${part('year')}`;
}

function admissionDate(value, label = 'Admission date') {
  const text = required(value, label, 10);
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);
  if (!match) failure(`Enter a ${label.toLowerCase()} as MM/DD/YYYY.`);
  const parsed = new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
  const [month, day, year] = manilaDate().split('/').map(Number);
  if (parsed.getFullYear() !== Number(match[3]) || parsed.getMonth() !== Number(match[1]) - 1 || parsed.getDate() !== Number(match[2]) || parsed > new Date(year, month - 1, day)) failure(`Enter a valid ${label.toLowerCase()} that is not in the future.`);
  return text;
}

function validateStudent(input) {
  const email = required(input.email, 'Email', 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) failure('Enter a valid email address.');
  const birth = admissionDate(input.birth, 'Birth date');
  const gender = required(input.gender, 'Gender', 30);
  const address = required(input.address, 'Address', 240);
  const phone = required(input.phone, 'Contact number', 40);
  const status = input.status === 'Inactive' ? 'Inactive' : 'Active';
  const studentType = input.studentType || 'regular';
  const semester = Number(input.semester || 1);
  if (!studentTypes.includes(studentType) || ![1, 2].includes(semester)) failure('Choose a valid student type and semester.');
  const level = required(input.level, 'Year level', 30);
  if (!['1st year', '2nd year', '3rd year', '4th year'].includes(level)) failure('Choose a year level from 1st to 4th year.');
  return { first: required(input.first, 'First name', 60), last: required(input.last, 'Last name', 60), birth, gender, address, phone, email, program: required(input.program, 'Program', 100), level, admitted: admissionDate(input.admitted), status, studentType, semester };
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

export function openStore(path, { now = () => new Date() } = {}) {
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
  if (db.prepare('PRAGMA user_version').get().user_version === 2) db.exec(`
    BEGIN;
    ALTER TABLE students ADD COLUMN birth TEXT;
    ALTER TABLE students ADD COLUMN gender TEXT;
    ALTER TABLE students ADD COLUMN address TEXT;
    ALTER TABLE students ADD COLUMN phone TEXT;
    CREATE TABLE subject_prerequisites (subject_id INTEGER NOT NULL REFERENCES subjects(id), prerequisite_id INTEGER NOT NULL REFERENCES subjects(id), PRIMARY KEY (subject_id, prerequisite_id), CHECK (subject_id != prerequisite_id));
    CREATE TABLE completed_subjects (student_id INTEGER NOT NULL REFERENCES students(id), subject_id INTEGER NOT NULL REFERENCES subjects(id), PRIMARY KEY (student_id, subject_id));
    PRAGMA user_version = 3;
    COMMIT;
  `);
  if (db.prepare('PRAGMA user_version').get().user_version === 3) db.exec(`
    BEGIN;
    ALTER TABLE students ADD COLUMN reviewed_at TEXT;
    UPDATE students SET reviewed_at = CURRENT_TIMESTAMP;
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    PRAGMA user_version = 4;
    COMMIT;
  `);
  if (db.prepare('PRAGMA user_version').get().user_version === 4) db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE students ADD COLUMN student_type TEXT NOT NULL DEFAULT 'regular' CHECK(student_type IN ('regular','back_subject','transferee','returning','academic_recovery','accessible_learning'));
    ALTER TABLE students ADD COLUMN semester INTEGER NOT NULL DEFAULT 1 CHECK(semester IN (1,2));
    ALTER TABLE students ADD COLUMN password_hash TEXT;
    ALTER TABLE students ADD COLUMN consent_at TEXT;
    ALTER TABLE subjects ADD COLUMN units REAL NOT NULL DEFAULT 3 CHECK(units > 0 AND units <= 12);
    ALTER TABLE sections ADD COLUMN start_date TEXT;
    ALTER TABLE sections ADD COLUMN end_date TEXT;
    CREATE TABLE curriculum (subject_id INTEGER NOT NULL REFERENCES subjects(id), program TEXT NOT NULL, year_level INTEGER NOT NULL CHECK(year_level BETWEEN 1 AND 4), semester INTEGER NOT NULL CHECK(semester IN (1,2)), PRIMARY KEY(subject_id,program,year_level,semester));
    CREATE TABLE enrollment_plans (id INTEGER PRIMARY KEY, student_id INTEGER NOT NULL REFERENCES students(id), term_id TEXT NOT NULL REFERENCES terms(id), status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','pending','accepted','declined','confirmed')), revision INTEGER NOT NULL DEFAULT 1, assigned_by TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(student_id,term_id));
    CREATE TABLE plan_subjects (plan_id INTEGER NOT NULL REFERENCES enrollment_plans(id), subject_id INTEGER NOT NULL REFERENCES subjects(id), PRIMARY KEY(plan_id,subject_id));
    CREATE TABLE plan_sections (plan_id INTEGER NOT NULL REFERENCES enrollment_plans(id), section_id INTEGER NOT NULL REFERENCES sections(id), PRIMARY KEY(plan_id,section_id));
    CREATE UNIQUE INDEX one_active_term ON terms(active) WHERE active = 1;
    PRAGMA user_version = 5;
    COMMIT;
  `);
  if (db.prepare('PRAGMA user_version').get().user_version === 5) db.exec(`
    BEGIN IMMEDIATE;
    INSERT OR IGNORE INTO enrollment_plans(student_id,term_id,status,assigned_by)
      SELECT e.student_id,s.term_id,'confirmed','legacy:registrar' FROM enrollments e JOIN sections s ON s.id=e.section_id GROUP BY e.student_id,s.term_id;
    INSERT OR IGNORE INTO plan_subjects(plan_id,subject_id)
      SELECT p.id,s.subject_id FROM enrollments e JOIN sections s ON s.id=e.section_id JOIN enrollment_plans p ON p.student_id=e.student_id AND p.term_id=s.term_id;
    INSERT OR IGNORE INTO plan_sections(plan_id,section_id)
      SELECT p.id,s.id FROM enrollments e JOIN sections s ON s.id=e.section_id JOIN enrollment_plans p ON p.student_id=e.student_id AND p.term_id=s.term_id;
    PRAGMA user_version = 6;
    COMMIT;
  `);

  if (db.prepare('PRAGMA user_version').get().user_version === 6) db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE academic_results(student_id INTEGER NOT NULL REFERENCES students(id), subject_id INTEGER NOT NULL REFERENCES subjects(id), term_id TEXT REFERENCES terms(id), grade TEXT NOT NULL DEFAULT '', remark TEXT NOT NULL CHECK(remark IN ('passed','failed','not_taken')), updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(student_id,subject_id));
    INSERT INTO academic_results(student_id,subject_id,remark) SELECT student_id,subject_id,'passed' FROM completed_subjects;
    CREATE TABLE back_subject_choices(student_id INTEGER NOT NULL REFERENCES students(id),term_id TEXT NOT NULL REFERENCES terms(id),codes TEXT NOT NULL,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(student_id,term_id));
    CREATE TABLE resources(id INTEGER PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('room','professor')),name TEXT NOT NULL COLLATE NOCASE,capacity INTEGER CHECK(capacity BETWEEN 1 AND 500),UNIQUE(kind,name));
    CREATE TABLE password_resets(token_hash TEXT PRIMARY KEY,role TEXT NOT NULL CHECK(role IN ('student','department_head')),target TEXT NOT NULL,expires_at TEXT NOT NULL,used_at TEXT,created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    ALTER TABLE audit_log ADD COLUMN actor_label TEXT;
    PRAGMA user_version=7;
    COMMIT;
  `);
  if (db.prepare('PRAGMA user_version').get().user_version === 7) db.exec(`
    BEGIN IMMEDIATE;
    ALTER TABLE academic_results ADD COLUMN raw_grade TEXT NOT NULL DEFAULT '';
    ALTER TABLE password_resets ADD COLUMN verification_note TEXT NOT NULL DEFAULT '';
    PRAGMA user_version=8;
    COMMIT;
  `);
  if (db.prepare('PRAGMA user_version').get().user_version === 8) db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE curriculum_next (subject_id INTEGER NOT NULL REFERENCES subjects(id),program TEXT NOT NULL,year_level INTEGER NOT NULL CHECK(year_level BETWEEN 1 AND 4),semester INTEGER NOT NULL CHECK(semester IN (1,2,3)),display_title TEXT NOT NULL DEFAULT '',source_label TEXT NOT NULL DEFAULT '',minimum_year INTEGER NOT NULL DEFAULT 0 CHECK(minimum_year BETWEEN 0 AND 4),minimum_passed_units REAL NOT NULL DEFAULT 0 CHECK(minimum_passed_units >= 0),PRIMARY KEY(subject_id,program,year_level,semester));
    INSERT INTO curriculum_next(subject_id,program,year_level,semester) SELECT subject_id,program,year_level,semester FROM curriculum;
    DROP TABLE curriculum;
    ALTER TABLE curriculum_next RENAME TO curriculum;
    ALTER TABLE sections ADD COLUMN title_override TEXT;
    PRAGMA user_version=9;
    COMMIT;
  `);
  if (db.prepare('PRAGMA user_version').get().user_version === 9) db.exec(`
    BEGIN IMMEDIATE;
    CREATE TABLE blocks(id INTEGER PRIMARY KEY,program TEXT NOT NULL,group_code TEXT NOT NULL,cohort_year INTEGER NOT NULL,capacity INTEGER NOT NULL CHECK(capacity BETWEEN 1 AND 500),UNIQUE(program,cohort_year,group_code));
    CREATE TABLE student_blocks(student_id INTEGER PRIMARY KEY REFERENCES students(id),block_id INTEGER NOT NULL REFERENCES blocks(id),assigned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE block_transfers(id INTEGER PRIMARY KEY,student_id INTEGER NOT NULL REFERENCES students(id),from_block_id INTEGER REFERENCES blocks(id),to_block_id INTEGER NOT NULL REFERENCES blocks(id),reason TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE block_terms(id INTEGER PRIMARY KEY,block_id INTEGER NOT NULL REFERENCES blocks(id),term_id TEXT NOT NULL REFERENCES terms(id),year_level INTEGER NOT NULL CHECK(year_level BETWEEN 1 AND 4),curriculum_source TEXT NOT NULL DEFAULT '',UNIQUE(block_id,term_id));
    CREATE TABLE block_classes(block_term_id INTEGER NOT NULL REFERENCES block_terms(id),subject_id INTEGER NOT NULL REFERENCES subjects(id),section_id INTEGER NOT NULL UNIQUE REFERENCES sections(id),PRIMARY KEY(block_term_id,subject_id));
    ALTER TABLE enrollment_plans ADD COLUMN block_term_id INTEGER REFERENCES block_terms(id);
    PRAGMA user_version=10;
    COMMIT;
  `);
  const legacyActorReference = db.prepare('PRAGMA foreign_key_list(students)').all().some(row => row.from === 'created_by' && row.table === 'users');
  const legacyAuditReference = db.prepare('PRAGMA foreign_key_list(audit_log)').all().some(row => row.from === 'actor_id' && row.table === 'users');
  const recordActorId = actor => legacyActorReference ? null : actorId(actor);

  const programCode = program => schoolPrograms.find(row=>row.name===program)?.code || program;
  const blockName = (block,year) => `${programCode(block.program)} ${year}${block.groupCode}`;
  function registrarOnly(actor) { if (actor?.role!=='registrar') failure('Only the Registrar can manage permanent blocks.',403); }
  function homeBlock(number) {
    const row=db.prepare('SELECT b.id,b.program,b.group_code AS groupCode,b.cohort_year AS cohortYear,b.capacity,s.level,sb.assigned_at AS assignedAt FROM student_blocks sb JOIN students s ON s.id=sb.student_id JOIN blocks b ON b.id=sb.block_id WHERE s.number=?').get(number);
    return row ? {...row,label:blockName(row,parseInt(row.level))} : null;
  }
  function blockRows() {
    return db.prepare('SELECT b.id,b.program,b.group_code AS groupCode,b.cohort_year AS cohortYear,b.capacity,count(sb.student_id) AS members FROM blocks b LEFT JOIN student_blocks sb ON sb.block_id=b.id GROUP BY b.id ORDER BY b.program,b.cohort_year DESC,b.group_code').all();
  }
  function blockTransfers() {
    return db.prepare('SELECT h.id,s.number AS studentId,h.from_block_id AS fromBlockId,h.to_block_id AS toBlockId,h.reason,h.actor,h.at FROM block_transfers h JOIN students s ON s.id=h.student_id ORDER BY h.id DESC').all();
  }
  function blockTermRecord(id) {
    const row=db.prepare('SELECT bt.id,bt.block_id AS blockId,bt.term_id AS termId,bt.year_level AS yearLevel,bt.curriculum_source AS source,b.program,b.group_code AS groupCode,b.cohort_year AS cohortYear,b.capacity FROM block_terms bt JOIN blocks b ON b.id=bt.block_id WHERE bt.id=?').get(Number(id));
    if (!row) failure('Block schedule was not found.',404);
    return {...row,label:blockName(row,row.yearLevel)};
  }
  function blockSubjects(term) { return curriculum().filter(row=>row.program===term.program && row.yearLevel===term.yearLevel && row.semester===Number(term.termId.split('-')[1]) && row.source===term.source); }
  function blockTermRows() {
    return db.prepare('SELECT id FROM block_terms WHERE term_id=?').all(activeTerm().id).map(({id})=>{
      const term=blockTermRecord(id);
      return {...term,subjects:blockSubjects(term),classes:db.prepare('SELECT s.public_id AS sectionId,sub.code FROM block_classes c JOIN sections s ON s.id=c.section_id JOIN subjects sub ON sub.id=c.subject_id WHERE c.block_term_id=? ORDER BY sub.code').all(id)};
    });
  }
  function classBlockLabel(publicId) {
    const row=db.prepare('SELECT c.block_term_id AS id FROM block_classes c JOIN sections s ON s.id=c.section_id WHERE s.public_id=?').get(publicId);
    return row ? blockTermRecord(row.id).label : null;
  }
  function classBlockLabelByMeeting(planId,code) {
    const row=db.prepare('SELECT c.block_term_id AS id FROM plan_sections ps JOIN sections s ON s.id=ps.section_id JOIN subjects sub ON sub.id=s.subject_id JOIN block_classes c ON c.section_id=s.id WHERE ps.plan_id=? AND sub.code=?').get(planId,code);
    return row ? blockTermRecord(row.id).label : null;
  }
  function createBlock(input,actor) {
    registrarOnly(actor);
    const program=required(input.program,'Program',100),groupCode=required(input.groupCode,'Block letter',3).toUpperCase(),cohortYear=Number(input.cohortYear),capacity=Number(input.capacity);
    if (!/^[A-Z]{1,3}$/.test(groupCode) || !Number.isInteger(cohortYear) || cohortYear<2000 || cohortYear>2099 || !Number.isInteger(capacity) || capacity<1 || capacity>500) failure('Enter a block letter, intake year from 2000–2099, and capacity from 1–500.');
    return transaction(()=>{const id=Number(db.prepare('INSERT INTO blocks(program,group_code,cohort_year,capacity) VALUES(?,?,?,?)').run(program,groupCode,cohortYear,capacity).lastInsertRowid);audit(actor,'create_block','block',id);return blockRows().find(row=>row.id===id);});
  }
  function assignHomeBlock(number,input,actor) {
    registrarOnly(actor);
    return transaction(()=>{
      const student=studentRecord(number),before=homeBlock(number),block=blockRows().find(row=>row.id===Number(input.blockId));
      if (!block || block.program!==student.program) failure('Choose a block in the student’s program.',409);
      if (before?.id===block.id) return before;
      if (!student.reviewed_at) failure('Registration is awaiting Registrar review. Open the student record and confirm registration before assigning a block.',409);
      if (student.status!=='Active') failure('This student is inactive. Review the student record and set the status to Active before assigning a block.',409);
      const plan=currentPlan(student);
      if (before && plan && ['pending','accepted','confirmed'].includes(plan.status)) failure('Transfer before a schedule offer is published, or in a later term. The current published enrollment is unchanged.',409);
      const reason=before ? required(input.reason,'Transfer reason',240) : 'Initial block assignment';
      const lowest=db.prepare('SELECT min(s.capacity) AS capacity FROM block_classes c JOIN block_terms bt ON bt.id=c.block_term_id JOIN sections s ON s.id=c.section_id WHERE bt.block_id=? AND bt.term_id=?').get(block.id,activeTerm().id).capacity;
      if (block.members>=Math.min(block.capacity,lowest ?? block.capacity)) failure('This block has no available membership places.',409);
      db.prepare('INSERT INTO student_blocks(student_id,block_id) VALUES(?,?) ON CONFLICT(student_id) DO UPDATE SET block_id=excluded.block_id,assigned_at=CURRENT_TIMESTAMP').run(student.id,block.id);
      db.prepare('INSERT INTO block_transfers(student_id,from_block_id,to_block_id,reason,actor) VALUES(?,?,?,?,?)').run(student.id,before?.id ?? null,block.id,reason,actorId(actor));
      if (before && plan?.status==='draft') {
        db.prepare('DELETE FROM plan_subjects WHERE plan_id=?').run(plan.id);
        db.prepare('DELETE FROM plan_sections WHERE plan_id=?').run(plan.id);
        db.prepare('UPDATE enrollment_plans SET revision=revision+1,block_term_id=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(plan.id);
      }
      audit(actor,before?'transfer_block':'assign_block','student',number);
      return homeBlock(number);
    });
  }
  function createBlockTerm(input,actor) {
    registrarOnly(actor);
    const block=blockRows().find(row=>row.id===Number(input.blockId)),yearLevel=Number(input.yearLevel);
    if (!block || ![1,2,3,4].includes(yearLevel)) failure('Choose a permanent block and year level.');
    const entries=curriculum().filter(row=>row.program===block.program && row.yearLevel===yearLevel && row.semester===Number(activeTerm().id.split('-')[1]));
    const source=input.source ?? (entries.some(row=>row.source==='2022–2023')?'2022–2023':'');
    if (!entries.some(row=>row.source===source)) failure('No curriculum exists for this program, year, term and version.',409);
    return transaction(()=>{const id=Number(db.prepare('INSERT INTO block_terms(block_id,term_id,year_level,curriculum_source) VALUES(?,?,?,?)').run(block.id,activeTerm().id,yearLevel,source).lastInsertRowid);audit(actor,'prepare_block_term','block',id);return blockTermRecord(id);});
  }
  function validateBlockClass(id,section,actor) {
    registrarOnly(actor);
    const term=blockTermRecord(id);
    if (term.termId!==activeTerm().id) failure('Choose a block schedule in the active term.',409);
    if (!blockSubjects(term).some(row=>row.code===section.code)) failure('This subject is not in the block’s curriculum for this term.',409);
    if (section.capacity>term.capacity) failure('Class capacity cannot exceed permanent block capacity.',409);
    const members=db.prepare('SELECT count(*) AS n FROM student_blocks WHERE block_id=?').get(term.blockId).n;
    if (section.capacity<members) failure('Class capacity must accommodate the students already assigned to this block.',409);
    const conflict=db.prepare('SELECT 1 FROM block_classes c JOIN sections s ON s.id=c.section_id WHERE c.block_term_id=? AND s.day=? AND s.start<? AND ?<s.end AND (s.start_date IS NULL OR ? IS NULL OR (s.start_date<=? AND ?<=s.end_date))').get(Number(id),section.day,section.end,section.start,section.startDate || null,section.endDate || null,section.startDate || null);
    if (conflict) failure('This meeting overlaps another subject in the block schedule.',409);
  }
  function addBlockClass(id,input,actor) {
    registrarOnly(actor);
    const term=blockTermRecord(id),subject=blockSubjects(term).find(row=>row.code===String(input.code || '').trim().toUpperCase());
    if (!subject) failure('Choose an unscheduled subject from this block curriculum.');
    if (!resources().some(row=>row.kind==='room' && row.name===input.room) || !resources().some(row=>row.kind==='professor' && row.name===input.instructor)) failure('Select a registered room and professor.');
    return addSection({...input,code:subject.code,title:subject.title,section:term.yearLevel+term.groupCode},actor,Number(id));
  }
  function linkBlockClass(id,sectionId,actor) {
    registrarOnly(actor);
    return transaction(()=>{
      const existing=db.prepare('SELECT block_term_id AS id FROM block_classes c JOIN sections s ON s.id=c.section_id WHERE s.public_id=?').get(sectionId);
      if (existing?.id===Number(id)) return {sectionId};
      const section=db.prepare('SELECT s.*,sub.code,s.start_date AS startDate,s.end_date AS endDate FROM sections s JOIN subjects sub ON sub.id=s.subject_id WHERE s.public_id=? AND s.term_id=?').get(sectionId,activeTerm().id);
      if (!section || !catalogSectionMatches(sectionId,blockTermRecord(id).program)) failure('Choose a compatible subject offering in the active term.',409);
      if (db.prepare('SELECT 1 FROM plan_sections WHERE section_id=?').get(section.id)) failure('Published or assigned classes cannot be moved into a block retrospectively.',409);
      validateBlockClass(id,section,actor);
      db.prepare('INSERT INTO block_classes VALUES(?,?,?)').run(Number(id),section.subject_id,section.id);
      audit(actor,'link_block_class','block',id+':'+sectionId);return {sectionId};
    });
  }
  function blockOfferSections(student,id) {
    const home=homeBlock(student.number);
    const current=id===null ? db.prepare('SELECT id FROM block_terms WHERE block_id=? AND term_id=?').get(home.id,activeTerm().id)?.id : id;
    if (!current) failure('Prepare this student’s home block schedule for the active term first.',409);
    const term=blockTermRecord(current);
    if (term.blockId!==home.id || term.termId!==activeTerm().id || term.yearLevel!==parseInt(student.level)) failure('Use the student’s home block and current year level in the active term.',409);
    const completed=db.prepare('SELECT sub.code FROM completed_subjects c JOIN subjects sub ON sub.id=c.subject_id WHERE c.student_id=?').all(student.id).map(row=>row.code);
    const required=blockSubjects(term).filter(row=>!completed.includes(row.code));
    if (!required.length || required.length>12) failure('No applicable block subjects, or more than 12 subjects. Review this student’s evaluation.',409);
    const classes=db.prepare('SELECT sub.code,s.public_id AS id FROM block_classes c JOIN subjects sub ON sub.id=c.subject_id JOIN sections s ON s.id=c.section_id WHERE c.block_term_id=?').all(term.id);
    const missing=required.filter(row=>!classes.some(section=>section.code===row.code));
    if (missing.length) failure('Finish the block schedule for: '+missing.map(row=>row.code).join(', '),409);
    return {id:term.id,codes:required.map(row=>row.code),sectionIds:required.map(row=>classes.find(section=>section.code===row.code).id)};
  }
  function offerBlockPlan(number,id,actor) { return offerPlan(number,[],actor,Number(id)); }
  function activeTerm() {
    return db.prepare('SELECT id, label FROM terms WHERE active = 1 LIMIT 1').get();
  }

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try { const result = work(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  function audit(actor, action, entity, id) {
    db.prepare('INSERT INTO audit_log (actor_id, actor_label, action, entity, entity_id) VALUES (?, ?, ?, ?, ?)').run(legacyAuditReference ? null : actorId(actor), String(actorId(actor)), action, entity, String(id));
  }
  function list(actor) {
    const term = activeTerm();
    const terms = db.prepare(`SELECT terms.id, terms.label, terms.active, COUNT(DISTINCT sections.id) AS sections, COUNT(enrollments.student_id) AS enrollments
      FROM terms LEFT JOIN sections ON sections.term_id = terms.id LEFT JOIN enrollments ON enrollments.section_id = sections.id
      GROUP BY terms.id ORDER BY terms.id DESC`).all();
    const students = db.prepare('SELECT number AS id, first, last, birth, gender, address, phone, email, program, level, admitted, status, student_type AS studentType, semester, reviewed_at AS reviewedAt FROM students ORDER BY id').all().filter(student => actor?.role !== 'department_head' || student.studentType !== 'regular').map(student=>({...student,homeBlock:homeBlock(student.id)}));
    const sections = db.prepare(`SELECT sections.public_id AS id, subjects.code, COALESCE(sections.title_override, subjects.title) AS title, sections.label AS section, sections.instructor, sections.day, sections.start, sections.end, sections.room, sections.capacity, sections.start_date AS startDate, sections.end_date AS endDate, COALESCE((SELECT group_concat(prereq.code, ', ') FROM subject_prerequisites JOIN subjects prereq ON prereq.id = subject_prerequisites.prerequisite_id WHERE subject_prerequisites.subject_id = subjects.id), '') AS prerequisites FROM sections JOIN subjects ON subjects.id = sections.subject_id WHERE sections.term_id = ? ORDER BY sections.id`).all(term.id).map(section => ({...section,catalogMatch:catalogSectionMatches(section.id),blockLabel:classBlockLabel(section.id)}));
    const enrollments = db.prepare('SELECT students.number AS studentId, sections.public_id AS sectionId FROM enrollments JOIN students ON students.id = enrollments.student_id JOIN sections ON sections.id = enrollments.section_id WHERE sections.term_id = ? ORDER BY enrollments.created_at').all(term.id);
    const completed = db.prepare('SELECT students.number AS studentId, subjects.code FROM completed_subjects JOIN students ON students.id = completed_subjects.student_id JOIN subjects ON subjects.id = completed_subjects.subject_id').all();
    const visible = new Set(students.map(student => student.id));
    return { blocks: actor?.role==='department_head' ? [] : blockRows(), blockTerms: actor?.role==='department_head' ? [] : blockTermRows(), blockTransfers: actor?.role==='department_head' ? [] : blockTransfers(), term, terms, students, sections, enrollments: enrollments.filter(row => visible.has(row.studentId)), completed: completed.filter(row => visible.has(row.studentId)), results: resultRows().filter(row => visible.has(row.studentId)), backChoices: choiceRows().filter(row => visible.has(row.studentId)), resources: resources(), curriculum: curriculum(), plans: plans().filter(row => row.termId === term.id && visible.has(row.studentId)) };
  }
  function createTerm(input, actor) {
    const year = Number(input.year);
    const semester = Number(input.semester);
    if (!Number.isInteger(year) || year < 2000 || year > 2099) failure('Choose a starting year from 2000 to 2099.');
    if (![1, 2].includes(semester)) failure('Choose Semester 1 or Semester 2.');
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
      const existing = db.prepare('SELECT number FROM students WHERE email = ? OR (lower(first) = lower(?) AND lower(last) = lower(?) AND birth = ?) LIMIT 1').get(student.email, student.first, student.last, student.birth);
      if (existing) failure(`Student already has a master record: ${existing.number}.`, 409);
      const year = new Intl.DateTimeFormat('en-SG', { timeZone: 'Asia/Singapore', year: '2-digit' }).format(now());
      const max = db.prepare("SELECT MAX(CAST(SUBSTR(number, 4) AS INTEGER)) AS value FROM students WHERE number LIKE ?").get(`${year}-%`).value || 0;
      if (max >= 99999) failure(`Student number sequence for ${year} is full.`, 409);
      const number = `${year}-${String(max + 1).padStart(5, '0')}`;
      db.prepare('INSERT INTO students (number, first, last, birth, gender, address, phone, email, program, level, admitted, status, created_by, reviewed_at, student_type, semester, consent_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(number, student.first, student.last, student.birth, student.gender, student.address, student.phone, student.email, student.program, student.level, student.admitted, student.status, recordActorId(actor), actor === 'student' ? null : new Date().toISOString(), student.studentType, student.semester, input.consent === true ? new Date().toISOString() : null);
      audit(actor, 'create', 'student', number);
      return { id: number, ...student };
    });
  }
  function registerStudent(input) {
    const term = activeTerm();
    if (!term) failure('Registration is unavailable until the Registrar sets an active term.', 409);
    const semester = Number(term.id.split('-')[1]);
    if ((input.termId && input.termId !== term.id) || (input.semester !== undefined && Number(input.semester) !== semester)) failure('The active term has changed. Review the current term before registering.', 409);
    const student = validateStudent({ ...input, semester, admitted: manilaDate(now()) });
    const existing = db.prepare('SELECT number AS id, reviewed_at AS reviewedAt FROM students WHERE email = ? AND birth = ?').get(student.email, student.birth);
    if (existing) return { ...existing, existing: true };
    const possible = db.prepare('SELECT 1 FROM students WHERE email = ? OR (lower(first) = lower(?) AND lower(last) = lower(?) AND birth = ?)').get(student.email, student.first, student.last, student.birth);
    if (possible) failure('A possible existing record needs registrar review.', 409);
    return { ...addStudent({ ...student, consent: input.consent }, 'student'), existing: false, reviewedAt: null };
  }
  function reviewStudent(number, actor = null) {
    return transaction(() => {
      const result = db.prepare('UPDATE students SET reviewed_at = CURRENT_TIMESTAMP WHERE number = ? AND reviewed_at IS NULL').run(number);
      if (!result.changes) failure('Pending registration was not found.', 404);
      audit(actor, 'review', 'student', number);
      return { id: number, reviewed: true };
    });
  }
  function studentStatus(number, email, birth) {
    const student = db.prepare('SELECT id, number, first, last, email, birth, reviewed_at FROM students WHERE number = ? AND email = ? AND birth = ?').get(number, String(email || '').trim().toLowerCase(), birth);
    if (!student) failure('Student record was not found with those details.', 404);
    const classes = db.prepare('SELECT subjects.code, COALESCE(sections.title_override, subjects.title) AS title, sections.label AS section, sections.day, sections.start, sections.end, sections.room, sections.instructor FROM enrollments JOIN sections ON sections.id = enrollments.section_id JOIN subjects ON subjects.id = sections.subject_id WHERE enrollments.student_id = ? AND sections.term_id = ? ORDER BY sections.day, sections.start').all(student.id, activeTerm().id);
    return { id: student.number, name: `${student.first} ${student.last}`, reviewed: Boolean(student.reviewed_at), term: activeTerm().label, classes };
  }
  function registrarPassword() { return db.prepare("SELECT value FROM settings WHERE key = 'registrar_password'").get()?.value || null; }
  function setRegistrarPassword(value) {
    if (registrarPassword()) failure('Registrar password is already configured.', 409);
    db.prepare("INSERT INTO settings (key, value) VALUES ('registrar_password', ?)").run(value);
  }
  function updateStudent(number, input, actor) {
    const student = validateStudent(input);
    return transaction(() => {
      const original = db.prepare('SELECT id, program, level, student_type FROM students WHERE number = ?').get(number);
      if (!original) failure('Student record was not found.', 404);
      if (homeBlock(number) && original.program !== student.program) failure('A student with a permanent block cannot change program through record editing.',409);
      if (student.studentType === 'regular' && failedRows(original.id).length) failure('Resolve failed subject results before classifying this student as regular.',409);
      if ((original.program !== student.program || original.level !== student.level || original.student_type !== student.studentType) && db.prepare("SELECT 1 FROM enrollment_plans WHERE student_id = ? AND term_id = ? AND status != 'declined'").get(original.id, activeTerm().id)) failure('Resolve this term enrollment before changing program, year level, or student type.', 409);
      const duplicate = db.prepare('SELECT 1 FROM students WHERE number != ? AND (email = ? OR (lower(first)=lower(?) AND lower(last)=lower(?) AND birth=?))').get(number, student.email, student.first, student.last, student.birth);
      if (duplicate) failure('A possible duplicate student record needs review.', 409);
      const result = db.prepare('UPDATE students SET first=?, last=?, birth=?, gender=?, address=?, phone=?, email=?, program=?, level=?, admitted=?, status=?, updated_at=CURRENT_TIMESTAMP WHERE number=?').run(student.first, student.last, student.birth, student.gender, student.address, student.phone, student.email, student.program, student.level, student.admitted, student.status, number);
      if (!result.changes) failure('Student record was not found.', 404);
      db.prepare('UPDATE students SET student_type=?, semester=? WHERE number=?').run(student.studentType, student.semester, number);
      audit(actor, 'update', 'student', number);
      return { id: number, ...student };
    });
  }
  function subjectId(code, title) {
    const existing = db.prepare('SELECT id, title FROM subjects WHERE code = ?').get(code);
    if (existing) {
      if (existing.title.toLowerCase() !== title.toLowerCase() && !db.prepare('SELECT 1 FROM curriculum WHERE subject_id=? AND lower(display_title)=lower(?)').get(existing.id,title)) failure(`Subject ${code} already has a different title.`, 409);
      return existing.id;
    }
    return db.prepare('INSERT INTO subjects (code, title) VALUES (?, ?)').run(code, title).lastInsertRowid;
  }
  function addSection(input, actor, blockTermId = null) {
    const room = db.prepare("SELECT * FROM resources WHERE kind='room' AND name=? COLLATE NOCASE").get(String(input.room || '').trim());
    const professor = db.prepare("SELECT * FROM resources WHERE kind='professor' AND name=? COLLATE NOCASE").get(String(input.instructor || '').trim());
    const section = validateSection({ ...input, room: room?.name || input.room, instructor: professor?.name || input.instructor });
    if (room && section.capacity > room.capacity) failure('Section capacity exceeds the selected room capacity.', 409);
    return transaction(() => {
      const subject = subjectId(section.code, section.title);
      if (blockTermId !== null) validateBlockClass(blockTermId,{...section,startDate:input.startDate,endDate:input.endDate},actor);
      const catalogued = Boolean(db.prepare('SELECT 1 FROM curriculum WHERE subject_id=?').get(subject));
      const supplied = [...new Set(String(input.prerequisites || '').split(',').map(code => code.trim().toUpperCase()).filter(Boolean))].sort();
      if (catalogued && input.prerequisites !== undefined) {
        const requiredCodes=db.prepare('SELECT p.code FROM subject_prerequisites link JOIN subjects p ON p.id=link.prerequisite_id WHERE link.subject_id=? ORDER BY p.code').all(subject).map(row=>row.code);
        if (JSON.stringify(supplied)!==JSON.stringify(requiredCodes)) failure('Prerequisites are set by the curriculum. Update them in Curriculum before creating a section.',409);
      }
      // Existing non-catalog integrations retain their legacy section setup path.
      const prerequisites=catalogued ? [] : supplied;
      for (const code of prerequisites) {
        if (code === section.code) failure('A subject cannot require itself.');
        const prerequisite = db.prepare('SELECT id FROM subjects WHERE code = ?').get(code);
        if (!prerequisite) failure(`Create a section for prerequisite ${code} first.`);
        if (db.prepare('SELECT 1 FROM plan_subjects WHERE subject_id=?').get(subject) && !db.prepare('SELECT 1 FROM subject_prerequisites WHERE subject_id=? AND prerequisite_id=?').get(subject, prerequisite.id)) failure('Prerequisites cannot change while an enrollment plan uses this subject.', 409);
        if (db.prepare('WITH RECURSIVE ancestors(id) AS (SELECT prerequisite_id FROM subject_prerequisites WHERE subject_id=? UNION SELECT p.prerequisite_id FROM subject_prerequisites p JOIN ancestors a ON a.id=p.subject_id) SELECT 1 FROM ancestors WHERE id=?').get(prerequisite.id, subject)) failure('Prerequisite cycle is not allowed.', 409);
        db.prepare('INSERT OR IGNORE INTO subject_prerequisites (subject_id, prerequisite_id) VALUES (?, ?)').run(subject, prerequisite.id);
      }
      const max = db.prepare("SELECT MAX(CAST(SUBSTR(public_id, 5) AS INTEGER)) AS value FROM sections").get().value || 0;
      const id = `SEC-${String(max + 1).padStart(3, '0')}`;
      const startDate = input.startDate || null, endDate = input.endDate || null;
      if (Boolean(startDate) !== Boolean(endDate)) failure('Enter both academic start and end dates.');
      for (const date of [startDate, endDate].filter(Boolean)) if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) failure('Enter valid academic dates as YYYY-MM-DD.');
      if (startDate && startDate > endDate) failure('Academic end date must be on or after the start date.');
      const resourceConflict = db.prepare('SELECT 1 FROM sections WHERE term_id=? AND day=? AND start < ? AND ? < end AND (lower(trim(room))=lower(trim(?)) OR lower(trim(instructor))=lower(trim(?))) AND (start_date IS NULL OR ? IS NULL OR (start_date <= ? AND ? <= end_date))').get(activeTerm().id, section.day, section.end, section.start, section.room, section.instructor, startDate, endDate, startDate);
      if (resourceConflict) failure('Room or instructor is already scheduled at this time.', 409);
      db.prepare('INSERT INTO sections (public_id, subject_id, term_id, label, instructor, day, start, end, room, capacity, start_date, end_date, title_override) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id, subject, activeTerm().id, section.section, section.instructor, section.day, section.start, section.end, section.room, section.capacity, startDate, endDate, section.title);
      if (blockTermId !== null) db.prepare('INSERT INTO block_classes(block_term_id,subject_id,section_id) VALUES(?,?,(SELECT id FROM sections WHERE public_id=?))').run(blockTermId,subject,id);
      audit(actor, 'create', 'section', id);
      return { id, ...section };
    });
  }
  function insertAllocation(studentNumber, sectionPublicId, actor) {
      const student = db.prepare('SELECT id, status, reviewed_at FROM students WHERE number = ?').get(studentNumber);
      if (!student || student.status !== 'Active') failure('Choose an active student.', 400);
      if (!student.reviewed_at) failure('Review this student registration before enrollment.', 409);
      const section = db.prepare('SELECT id, term_id, day, start, end, capacity FROM sections WHERE public_id = ?').get(sectionPublicId);
      if (!section) failure('Choose a section.', 404);
      if (section.term_id !== activeTerm().id) failure('Choose a section in the active term.', 409);
      const missing = db.prepare('SELECT prereq.code FROM subject_prerequisites JOIN subjects prereq ON prereq.id = subject_prerequisites.prerequisite_id WHERE subject_prerequisites.subject_id = (SELECT subject_id FROM sections WHERE id = ?) AND NOT EXISTS (SELECT 1 FROM completed_subjects WHERE completed_subjects.student_id = ? AND completed_subjects.subject_id = prereq.id)').all(section.id, student.id).map(row => row.code);
      if (missing.length) failure(`Prerequisite not completed: ${missing.join(', ')}.`, 409);
      if (db.prepare('SELECT 1 FROM enrollments WHERE student_id = ? AND section_id = ?').get(student.id, section.id)) failure('Student is already allocated to this section.', 409);
      if (db.prepare('SELECT 1 FROM enrollments e JOIN sections s ON s.id=e.section_id WHERE e.student_id=? AND s.term_id=? AND s.subject_id=(SELECT subject_id FROM sections WHERE id=?)').get(student.id, section.term_id, section.id)) failure('Student is already allocated to this subject in the active term.', 409);
      const occupied = db.prepare('SELECT COUNT(*) AS value FROM enrollments WHERE section_id = ?').get(section.id).value;
      if (occupied >= section.capacity) failure('This section has no available seats.', 409);
      const dates = db.prepare('SELECT start_date,end_date FROM sections WHERE id=?').get(section.id);
      const conflict = db.prepare('SELECT 1 FROM enrollments JOIN sections ON sections.id = enrollments.section_id WHERE enrollments.student_id = ? AND sections.term_id = ? AND sections.day = ? AND sections.start < ? AND ? < sections.end AND (sections.start_date IS NULL OR ? IS NULL OR (sections.start_date <= ? AND ? <= sections.end_date)) LIMIT 1').get(student.id, section.term_id, section.day, section.end, section.start, dates.start_date, dates.end_date, dates.start_date);
      if (conflict) failure('This section conflicts with another class in the student schedule.', 409);
      db.prepare('INSERT INTO enrollments (student_id, section_id, created_by) VALUES (?, ?, ?)').run(student.id, section.id, recordActorId(actor));
      audit(actor, 'allocate', 'section', `${studentNumber}:${sectionPublicId}`);
      return { studentId: studentNumber, sectionId: sectionPublicId };
  }
  function allocate(studentNumber, sectionPublicId, actor) { return transaction(() => insertAllocation(studentNumber, sectionPublicId, actor)); }
  function allocateMany(studentNumber, sectionIds, actor) {
    if (!Array.isArray(sectionIds) || sectionIds.length < 1 || sectionIds.length > 12 || new Set(sectionIds).size !== sectionIds.length) failure('Choose 1 to 12 distinct sections.');
    return transaction(() => sectionIds.map(sectionId => insertAllocation(studentNumber, sectionId, actor)));
  }
  function completeSubject(studentNumber, code, actor) {
    return transaction(() => {
      const student = db.prepare('SELECT id FROM students WHERE number = ?').get(studentNumber);
      const subject = db.prepare('SELECT id FROM subjects WHERE code = ?').get(String(code || '').trim().toUpperCase());
      if (!student || !subject) failure('Choose an existing student and subject.', 404);
      if (db.prepare('SELECT 1 FROM academic_results WHERE student_id=? AND subject_id=?').get(student.id,subject.id)) failure('This subject has an evaluated result. Update it through Individual evaluation.',409);
      db.prepare('INSERT OR IGNORE INTO completed_subjects (student_id, subject_id) VALUES (?, ?)').run(student.id, subject.id);
      audit(actor, 'complete', 'subject', `${studentNumber}:${code}`);
      return { studentId: studentNumber, code: String(code).trim().toUpperCase() };
    });
  }
  function drop(studentNumber, sectionPublicId, actor) {
    return transaction(() => {
      if (db.prepare('SELECT 1 FROM enrollment_plans p JOIN students s ON s.id=p.student_id WHERE s.number=? AND p.term_id=?').get(studentNumber, activeTerm().id)) failure('Offered enrollments cannot be changed through individual allocation removal.', 409);
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
        const student = validateStudent({ birth: item.birth || item.admitted, gender: item.gender || 'Unspecified', address: item.address || 'Legacy record', phone: item.phone || 'Not recorded', ...item });
        if (!/^\d{2}-\d{5}$/.test(item.id)) failure('A student number in browser data is invalid.');
        db.prepare('INSERT INTO students (number, first, last, birth, gender, address, phone, email, program, level, admitted, status, created_by, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)').run(item.id, student.first, student.last, student.birth, student.gender, student.address, student.phone, student.email, student.program, student.level, student.admitted, student.status, recordActorId(actor));
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
      db.exec(`INSERT INTO enrollment_plans(student_id,term_id,status,assigned_by) SELECT e.student_id,s.term_id,'confirmed','legacy:registrar' FROM enrollments e JOIN sections s ON s.id=e.section_id GROUP BY e.student_id,s.term_id;
        INSERT INTO plan_subjects SELECT DISTINCT p.id,s.subject_id FROM enrollment_plans p JOIN enrollments e ON e.student_id=p.student_id JOIN sections s ON s.id=e.section_id AND s.term_id=p.term_id;
        INSERT INTO plan_sections SELECT p.id,s.id FROM enrollment_plans p JOIN enrollments e ON e.student_id=p.student_id JOIN sections s ON s.id=e.section_id AND s.term_id=p.term_id;`);
      audit(actor, 'import', 'browser_data', `${input.students.length} students`);
      return { imported: true };
    });
  }
  function staffPassword(role) {
    if (!['registrar', 'department_head'].includes(role)) failure('Choose a staff role.');
    return db.prepare('SELECT value FROM settings WHERE key=?').get(`${role}_password`)?.value || null;
  }
  function setStaffPassword(role, hash) {
    staffPassword(role);
    db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(`${role}_password`, hash);
    audit({ role: 'registrar', id: 'registrar' }, 'configure', 'staff', role);
  }
  function studentPassword(number) { return db.prepare('SELECT password_hash FROM students WHERE number=?').get(number)?.password_hash || null; }
  function studentByCredentials(number, email, birth) {
    const row = db.prepare('SELECT number AS id FROM students WHERE number=? AND email=? AND birth=?').get(number, String(email || '').trim().toLowerCase(), birth);
    if (!row) failure('Student record was not found with those details.', 404);
    return row;
  }
  function setStudentPassword(number, hash) {
    const result = db.prepare('UPDATE students SET password_hash=? WHERE number=? AND password_hash IS NULL').run(hash, number);
    if (!result.changes) failure('Account is already configured or student does not exist. Ask the Registrar for help.', 409);
    audit({ role: 'student', id: number }, 'configure', 'account', number);
  }

  function resultRows() {
    return db.prepare(`SELECT s.number AS studentId,sub.code,COALESCE((SELECT NULLIF(c.display_title,'') FROM curriculum c WHERE c.subject_id=sub.id AND c.program=(SELECT program FROM students WHERE id=r.student_id) ORDER BY c.source_label DESC LIMIT 1),sub.title) AS title,r.grade,r.raw_grade AS rawGrade,r.remark,r.term_id AS termId,r.updated_at AS updatedAt FROM academic_results r JOIN students s ON s.id=r.student_id JOIN subjects sub ON sub.id=r.subject_id ORDER BY sub.code`).all();
  }
  function failedRows(id) {
    return db.prepare("SELECT sub.code,COALESCE((SELECT NULLIF(c.display_title,'') FROM curriculum c WHERE c.subject_id=sub.id AND c.program=(SELECT program FROM students WHERE id=r.student_id) ORDER BY c.source_label DESC LIMIT 1),sub.title) AS title,r.grade,r.raw_grade AS rawGrade,r.remark FROM academic_results r JOIN subjects sub ON sub.id=r.subject_id WHERE r.student_id=? AND r.remark='failed' ORDER BY sub.code").all(id);
  }
  function choiceFor(id) {
    const row = db.prepare('SELECT codes,updated_at AS updatedAt FROM back_subject_choices WHERE student_id=? AND term_id=?').get(id,activeTerm().id);
    return row ? { codes: JSON.parse(row.codes), updatedAt: row.updatedAt } : null;
  }
  function choiceRows() {
    return db.prepare('SELECT s.number AS studentId,c.codes,c.updated_at AS updatedAt FROM back_subject_choices c JOIN students s ON s.id=c.student_id WHERE c.term_id=?').all(activeTerm().id).map(row => ({...row,codes:JSON.parse(row.codes)}));
  }
  function recordResults(number, rows, actor) {
    if (actor?.role !== 'registrar') failure('Only the Registrar can record academic results.',403);
    if (!Array.isArray(rows) || !rows.length || rows.length > 200) failure('Provide 1 to 200 academic results.');
    return transaction(() => {
      const student = studentRecord(number), plan = currentPlan(student);
      if (plan && ['pending','accepted','confirmed'].includes(plan.status)) failure('Resolve the published enrollment before changing academic results.',409);
      const seen = new Set();
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) failure('Each result must contain a subject code and grade or remark.');
        const code = required(row.code,'Subject code',20).toUpperCase();
        if (seen.has(code)) failure('The import contains a duplicate subject code.');
        seen.add(code);
        const subject = db.prepare('SELECT id FROM subjects WHERE code=?').get(code);
        if (!subject || !db.prepare('SELECT 1 FROM curriculum WHERE subject_id=? AND program=?').get(subject.id,student.program)) failure('Subject '+code+' is not in this student’s curriculum.',409);
        const {grade,rawGrade,remark} = evaluateGrade(row);
        const termId = row.termId || activeTerm().id;
        if (!db.prepare('SELECT 1 FROM terms WHERE id=?').get(termId)) failure('Academic result term does not exist.');
        db.prepare('INSERT INTO academic_results(student_id,subject_id,term_id,grade,remark,raw_grade) VALUES(?,?,?,?,?,?) ON CONFLICT(student_id,subject_id) DO UPDATE SET term_id=excluded.term_id,grade=excluded.grade,remark=excluded.remark,raw_grade=excluded.raw_grade,updated_at=CURRENT_TIMESTAMP').run(student.id,subject.id,termId,grade,remark,rawGrade);
        if (remark === 'passed') db.prepare('INSERT OR IGNORE INTO completed_subjects VALUES(?,?)').run(student.id,subject.id);
        else db.prepare('DELETE FROM completed_subjects WHERE student_id=? AND subject_id=?').run(student.id,subject.id);
        audit(actor,'record_result','academic_result',number+':'+code);
      }
      if (failedRows(student.id).length && student.student_type === 'regular') db.prepare("UPDATE students SET student_type='back_subject',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(student.id);
      db.prepare('DELETE FROM back_subject_choices WHERE student_id=? AND term_id=?').run(student.id,activeTerm().id);
      if (plan?.status === 'draft') {
        db.prepare('DELETE FROM plan_subjects WHERE plan_id=?').run(plan.id);
        db.prepare('DELETE FROM plan_sections WHERE plan_id=?').run(plan.id);
        db.prepare('UPDATE enrollment_plans SET revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(plan.id);
      }
      return evaluation(number,actor);
    });
  }
  function chooseBackSubjects(number,codes,actor) {
    if (actor?.role !== 'student' || actor.id !== number) failure('Only the student can decide their own back subjects.',403);
    return transaction(() => {
      const student = studentRecord(number), failed = failedRows(student.id), plan = currentPlan(student);
      if (!student.reviewed_at) failure('Wait for the Registrar to review academic results.',409);
      if (!failed.length) failure('No failed subjects require a back-subject decision.',409);
      if (plan && plan.status !== 'declined' && !(plan.status === 'draft' && !db.prepare('SELECT 1 FROM plan_subjects WHERE plan_id=?').get(plan.id))) failure('Subject assignment has started. Contact the Registrar to revise your decision.',409);
      if (!Array.isArray(codes) || codes.some(code => typeof code !== 'string') || new Set(codes).size !== codes.length || codes.some(code => !failed.some(row => row.code === code))) failure('Choose only listed failed subjects, or defer them all.');
      db.prepare('INSERT INTO back_subject_choices(student_id,term_id,codes) VALUES(?,?,?) ON CONFLICT(student_id,term_id) DO UPDATE SET codes=excluded.codes,updated_at=CURRENT_TIMESTAMP').run(student.id,activeTerm().id,JSON.stringify(codes));
      audit(actor,'choose_back_subjects','enrollment',number+':'+activeTerm().id);
      return choiceFor(student.id);
    });
  }
  function evaluation(number,actor) {
    const student = studentRecord(number);
    if (!['registrar','department_head'].includes(actor?.role) || (actor.role === 'department_head' && student.student_type === 'regular')) failure('This record is not available to your role.',403);
    const results = resultRows().filter(row => row.studentId === number);
    const completed = db.prepare('SELECT sub.code FROM completed_subjects c JOIN subjects sub ON sub.id=c.subject_id WHERE c.student_id=?').all(student.id).map(row => row.code);
    const failed = failedRows(student.id), choice = choiceFor(student.id), term = activeTerm();
    const entries = curriculum().filter(row => row.program === student.program).map(row => {
      const result = results.find(item => item.code === row.code);
      const missing = row.prerequisites.split(',').map(code=>code.trim()).filter(code=>code && !completed.includes(code));
      const blockedReasons = [];
      if (!student.reviewed_at || student.status !== 'Active') blockedReasons.push('Registrar must review an active student record');
      if (completed.includes(row.code)) blockedReasons.push('Already passed');
      if (missing.length) blockedReasons.push('Prerequisite not passed: '+missing.join(', '));
      if (student.student_type === 'regular' && (Number(row.yearLevel)!==parseInt(student.level) || Number(row.semester)!==Number(term.id.split('-')[1]))) blockedReasons.push('Outside current year or semester');
      const standing = standingFailure(student,row);
      if (standing) blockedReasons.push(standing);
      if (!availableCatalogSection(row.code,student.program)) blockedReasons.push('No open section');
      if (failed.length && !choice) blockedReasons.push('Awaiting student back-subject decision');
      if (failed.some(item => item.code === row.code) && choice && !choice.codes.includes(row.code)) blockedReasons.push('Student deferred this back subject');
      return {...row,grade:result?.grade || '',rawGrade:result?.rawGrade || '',remark:result?.remark || (completed.includes(row.code)?'passed':'not_taken'),missingPrerequisites:missing,eligible:!blockedReasons.length,blockedReasons};
    });
    return {student:{id:number,name:student.first+' '+student.last,program:student.program,level:student.level,studentType:student.student_type,homeBlock:homeBlock(number)},term,results,failed,choice,needsBackSubjectDecision:Boolean(failed.length && !choice),curriculum:entries,plan:plans().find(row=>row.studentId===number && row.termId===term.id) || null};
  }
  function resources() { return db.prepare('SELECT id,kind,name,capacity FROM resources ORDER BY kind,name').all(); }
  function addResource(input,actor) {
    if (actor?.role !== 'registrar') failure('Registrar access is required.',403);
    const kind = input.kind, name = required(input.name,'Name',kind==='room'?40:100);
    if (!['room','professor'].includes(kind)) failure('Choose room or professor.');
    const capacity = kind === 'room' ? Number(input.capacity) : null;
    if (kind==='room' && (!Number.isInteger(capacity) || capacity<1 || capacity>500)) failure('Room capacity must be from 1 to 500.');
    return transaction(()=>{const id=db.prepare('INSERT INTO resources(kind,name,capacity) VALUES(?,?,?)').run(kind,name,capacity).lastInsertRowid;audit(actor,'create',kind,id);return {id,kind,name,capacity};});
  }
  function issueReset(role,target,tokenHash,actor,verificationNote='') {
    if (actor?.role !== 'registrar' || !['student','department_head'].includes(role)) failure('Only the Registrar can reset students or the Department Head.',403);
    if (role==='student') studentRecord(target);
    else {target='department_head';if(!staffPassword('department_head')) failure('Configure Department Head access first.',409);}
    return transaction(()=>{
      db.prepare('UPDATE password_resets SET used_at=CURRENT_TIMESTAMP WHERE role=? AND target=? AND used_at IS NULL').run(role,target);
      const expiresAt=new Date(now().getTime()+30*60*1000).toISOString();
      db.prepare('INSERT INTO password_resets(token_hash,role,target,expires_at,verification_note) VALUES(?,?,?,?,?)').run(tokenHash,role,target,expiresAt,verificationNote);
      audit(actor,'issue_password_reset','account',role+':'+target);
      return {role,target,expiresAt};
    });
  }
  function redeemReset(tokenHash,hash) {
    return transaction(()=>{
      const reset=db.prepare('SELECT * FROM password_resets WHERE token_hash=? AND used_at IS NULL').get(tokenHash);
      if(!reset || Date.parse(reset.expires_at)<=now().getTime()) failure('This reset link has expired or was already used. Ask the Registrar for a new link.',409);
      if(reset.role==='student') db.prepare('UPDATE students SET password_hash=? WHERE number=?').run(hash,reset.target);
      else db.prepare("UPDATE settings SET value=? WHERE key='department_head_password'").run(hash);
      db.prepare('UPDATE password_resets SET used_at=CURRENT_TIMESTAMP WHERE token_hash=?').run(tokenHash);
      audit({role:reset.role,id:reset.target},'reset_password','account',reset.role+':'+reset.target);
      return {role:reset.role,id:reset.target};
    });
  }

  function limitedPublicStatus(number, email, birth) {
    studentByCredentials(number, email, birth);
    const row = db.prepare('SELECT reviewed_at,updated_at FROM students WHERE number=?').get(number);
    return { id: number, reviewed: Boolean(row.reviewed_at), updatedAt: row.reviewed_at || row.updated_at, term: activeTerm().label, hasAccount: Boolean(studentPassword(number)) };
  }
  function curriculum() {
    return db.prepare(`SELECT s.code,COALESCE(NULLIF(c.display_title,''),s.title) AS title,s.units,c.program,c.year_level AS yearLevel,c.semester,c.source_label AS source,c.minimum_year AS minimumYear,c.minimum_passed_units AS minimumPassedUnits,
      COALESCE((SELECT group_concat(p.code, ', ') FROM subject_prerequisites sp JOIN subjects p ON p.id=sp.prerequisite_id WHERE sp.subject_id=s.id),'') AS prerequisites
      FROM curriculum c JOIN subjects s ON s.id=c.subject_id ORDER BY c.program,c.year_level,c.semester,s.code`).all();
  }
  function addCurriculum(input, actor) {
    if (actor?.role !== 'registrar') failure('Registrar access is required.', 403);
    const code = required(input.code, 'Subject code', 20).toUpperCase(), title = required(input.title, 'Title', 100);
    const program = required(input.program, 'Program', 100), year = Number(input.yearLevel), semester = Number(input.semester), units = Number(input.units);
    if (![1, 2, 3, 4].includes(year) || ![1, 2, 3].includes(semester) || !Number.isFinite(units) || units <= 0 || units > 12) failure('Choose year 1–4, semester 1–2 or Summer, and units greater than 0 and at most 12.');
    return transaction(() => {
      const id = subjectId(code, title);
      const codes = [...new Set(String(input.prerequisites || '').split(',').map(value => value.trim().toUpperCase()).filter(Boolean))];
      const prerequisites = codes.map(value => {
        const row = db.prepare('SELECT id FROM subjects WHERE code=?').get(value);
        if (!row || row.id === id) failure('Prerequisites must be existing, different subjects.');
        const cycle = db.prepare('WITH RECURSIVE ancestors(id) AS (SELECT prerequisite_id FROM subject_prerequisites WHERE subject_id=? UNION SELECT p.prerequisite_id FROM subject_prerequisites p JOIN ancestors a ON a.id=p.subject_id) SELECT 1 FROM ancestors WHERE id=?').get(row.id, id);
        if (cycle) failure('Prerequisite cycle is not allowed.', 409);
        return row.id;
      });
      // Catalog entries are immutable while any enrollment plan uses this subject.
      if (db.prepare('SELECT 1 FROM plan_subjects WHERE subject_id=?').get(id)) failure('This subject is used by an enrollment plan. Create a new curriculum version before changing it.', 409);
      db.prepare('UPDATE subjects SET units=? WHERE id=?').run(units, id);
      db.prepare('INSERT INTO curriculum(subject_id,program,year_level,semester) VALUES(?,?,?,?) ON CONFLICT DO NOTHING').run(id, program, year, semester);
      db.prepare('DELETE FROM subject_prerequisites WHERE subject_id=?').run(id);
      for (const prerequisite of prerequisites) db.prepare('INSERT INTO subject_prerequisites VALUES(?,?)').run(id, prerequisite);
      audit(actor, 'curriculum', 'subject', code);
      return { code, title, units, program, yearLevel: year, semester, prerequisites: codes.join(', ') };
    });
  }
  function importCurriculum(catalog,actor) {
    if (actor?.role !== 'registrar') failure('Registrar access is required.',403);
    const version = required(catalog.version,'Curriculum version',40);
    if (!Array.isArray(catalog.subjects) || !catalog.subjects.length || catalog.subjects.length>500) failure('Provide a complete curriculum catalog.');
    return transaction(()=>{
      const rows=catalog.subjects, codes=new Map();
      for (const row of rows) {
        required(row.code,'Subject code',20); required(row.title,'Subject title',100); required(row.program,'Program',100);
        if (![1,2,3,4].includes(row.yearLevel) || ![1,2,3].includes(row.semester) || !Number.isFinite(row.units) || row.units<=0 || row.units>12 || !Number.isInteger(row.minimumYear) || row.minimumYear<0 || row.minimumYear>4 || !Number.isFinite(row.minimumPassedUnits) || row.minimumPassedUnits<0) failure('Invalid curriculum entry: '+row.code);
        const existing=db.prepare('SELECT * FROM subjects WHERE code=?').get(row.code);
        if (existing && existing.units!==row.units) failure('Resolve the existing units for '+row.code+' before importing.',409);
        const titles=rows.filter(item=>item.code===row.code).map(item=>item.title.toLowerCase());
        if (existing && !titles.includes(existing.title.toLowerCase()) && (db.prepare('SELECT 1 FROM completed_subjects WHERE subject_id=?').get(existing.id) || db.prepare('SELECT 1 FROM academic_results WHERE subject_id=?').get(existing.id))) failure('Existing academic credits use '+row.code+' with a different title. Resolve this record before importing.',409);
        if (codes.has(row.code) && codes.get(row.code).prerequisites!==row.prerequisites) failure('Shared subject prerequisites disagree: '+row.code);
        codes.set(row.code,row);
        if (!existing) db.prepare('INSERT INTO subjects(code,title,units) VALUES(?,?,?)').run(row.code,row.title,row.units);
      }
      for (const row of codes.values()) {
        const subject=db.prepare('SELECT id FROM subjects WHERE code=?').get(row.code);
        const prerequisites=String(row.prerequisites||'').split(',').map(code=>code.trim()).filter(Boolean);
        const current=db.prepare('SELECT p.code FROM subject_prerequisites link JOIN subjects p ON p.id=link.prerequisite_id WHERE link.subject_id=?').all(subject.id).map(row=>row.code).sort();
        if (JSON.stringify(current)===JSON.stringify([...prerequisites].sort())) continue;
        if (db.prepare('SELECT 1 FROM plan_subjects WHERE subject_id=?').get(subject.id) || db.prepare('SELECT 1 FROM curriculum WHERE subject_id=?').get(subject.id)) failure('Resolve existing prerequisite rules for '+row.code+' before importing.',409);
        db.prepare('DELETE FROM subject_prerequisites WHERE subject_id=?').run(subject.id);
        for (const code of prerequisites) {
          const prerequisite=db.prepare('SELECT id FROM subjects WHERE code=?').get(code);
          if (!prerequisite || prerequisite.id===subject.id) failure('Invalid prerequisite '+code);
          db.prepare('INSERT INTO subject_prerequisites VALUES(?,?)').run(subject.id,prerequisite.id);
        }
      }
      const cycle=db.prepare('WITH RECURSIVE paths(origin,id) AS (SELECT subject_id,prerequisite_id FROM subject_prerequisites UNION SELECT p.origin,next.prerequisite_id FROM paths p JOIN subject_prerequisites next ON next.subject_id=p.id) SELECT 1 FROM paths WHERE origin=id LIMIT 1').get();
      if (cycle) failure('Curriculum contains a prerequisite cycle.',409);
      let inserted=0;
      for (const row of rows) {
        const id=db.prepare('SELECT id FROM subjects WHERE code=?').get(row.code).id;
        const current=db.prepare('SELECT * FROM curriculum WHERE subject_id=? AND program=? AND year_level=? AND semester=?').get(id,row.program,row.yearLevel,row.semester);
        if (current) {
          if (current.source_label!==version || current.display_title!==row.title || current.minimum_year!==row.minimumYear || current.minimum_passed_units!==row.minimumPassedUnits) failure('Existing curriculum entry needs review: '+row.code+' / '+row.program,409);
          continue;
        }
        db.prepare('INSERT INTO curriculum(subject_id,program,year_level,semester,display_title,source_label,minimum_year,minimum_passed_units) VALUES(?,?,?,?,?,?,?,?)').run(id,row.program,row.yearLevel,row.semester,row.title,version,row.minimumYear,row.minimumPassedUnits);
        inserted++;
      }
      if (inserted) audit(actor,'import_curriculum','curriculum',version+':'+inserted);
      return {version,inserted,existing:rows.length-inserted};
    });
  }
  function catalogSectionMatches(publicId, program = null) {
    return Boolean(db.prepare(`SELECT 1 FROM sections sec JOIN subjects sub ON sub.id=sec.subject_id JOIN curriculum c ON c.subject_id=sub.id WHERE sec.public_id=? AND (? IS NULL OR c.program=?) AND EXISTS (SELECT 1 FROM curriculum alias WHERE alias.subject_id=sub.id AND alias.source_label=c.source_label AND lower(COALESCE(NULLIF(alias.display_title,''),sub.title))=lower(COALESCE(sec.title_override,sub.title)))`).get(publicId,program,program));
  }
  function availableCatalogSection(code,program) {
    return db.prepare('SELECT sec.public_id AS id FROM sections sec JOIN subjects sub ON sub.id=sec.subject_id WHERE sub.code=? AND sec.term_id=? AND (SELECT count(*) FROM enrollments e WHERE e.section_id=sec.id)<sec.capacity').all(code,activeTerm().id).some(section=>catalogSectionMatches(section.id,program));
  }
  function standingFailure(student,entry) {
    if (!entry.minimumYear && !entry.minimumPassedUnits) return '';
    const passedUnits = db.prepare('SELECT COALESCE(sum(sub.units),0) AS units FROM completed_subjects credit JOIN subjects sub ON sub.id=credit.subject_id WHERE credit.student_id=? AND EXISTS(SELECT 1 FROM curriculum c WHERE c.subject_id=sub.id AND c.program=? AND (?=0 OR c.source_label=?))').get(student.id,student.program,entry.source ? 1 : 0,entry.source || '').units;
    if (parseInt(student.level) < entry.minimumYear || passedUnits < entry.minimumPassedUnits) return 'Requires '+({2:'2nd',3:'3rd',4:'4th'}[entry.minimumYear] || entry.minimumYear)+' year standing: at least '+entry.minimumPassedUnits+' passed curriculum units ('+passedUnits+' recorded)';
    return '';
  }
  function plans() {
    return db.prepare('SELECT p.id,s.number AS studentId,p.term_id AS termId,p.status,p.revision,p.assigned_by AS assignedBy,p.block_term_id AS blockTermId,p.updated_at AS updatedAt FROM enrollment_plans p JOIN students s ON s.id=p.student_id ORDER BY p.id').all().map(plan => ({
      ...plan,blockLabel:plan.blockTermId ? blockTermRecord(plan.blockTermId).label : null,
      subjects: db.prepare('SELECT s.code FROM plan_subjects p JOIN subjects s ON s.id=p.subject_id WHERE p.plan_id=? ORDER BY s.code').all(plan.id).map(row => row.code),
      sectionIds: db.prepare('SELECT s.public_id AS id FROM plan_sections p JOIN sections s ON s.id=p.section_id WHERE p.plan_id=?').all(plan.id).map(row => row.id)
    }));
  }
  function studentRecord(number) {
    const student = db.prepare('SELECT * FROM students WHERE number=?').get(number);
    if (!student) failure('Student record was not found.', 404);
    return student;
  }
  function currentPlan(student) { return db.prepare('SELECT * FROM enrollment_plans WHERE student_id=? AND term_id=?').get(student.id, activeTerm().id); }
  function checkSubject(student, code, regular) {
    const subject = db.prepare('SELECT * FROM subjects WHERE code=?').get(code);
    if (!subject) failure(`Subject ${code} was not found.`, 422);
    const match = regular ? db.prepare('SELECT 1 FROM curriculum WHERE subject_id=? AND program=? AND year_level=? AND semester=?').get(subject.id, student.program, parseInt(student.level), Number(activeTerm().id.split('-')[1])) : db.prepare('SELECT 1 FROM curriculum WHERE subject_id=? AND program=?').get(subject.id, student.program);
    if (!match) failure(`Subject ${code} does not belong to the applicable curriculum.`, 409);
    if (db.prepare('SELECT 1 FROM completed_subjects WHERE student_id=? AND subject_id=?').get(student.id, subject.id)) failure(`Subject ${code} is already completed.`, 409);
    const missing = db.prepare('SELECT p.code FROM subject_prerequisites sp JOIN subjects p ON p.id=sp.prerequisite_id WHERE sp.subject_id=? AND NOT EXISTS(SELECT 1 FROM completed_subjects c WHERE c.student_id=? AND c.subject_id=p.id)').all(subject.id, student.id);
    if (missing.length) failure(`Prerequisite not completed: ${missing.map(row => row.code).join(', ')}.`, 409);
    const entries = curriculum().filter(row=>row.code===code && row.program===student.program && (!regular || (row.yearLevel===parseInt(student.level) && row.semester===Number(activeTerm().id.split('-')[1]))));
    if (entries.every(entry=>standingFailure(student,entry))) failure(standingFailure(student,entries[0]),409);
    if (!availableCatalogSection(code,student.program)) failure(`No available section for ${code} in the active term.`, 409);
    return subject;
  }
  function writeAssignment(student, codes, actor) {
    if (!Array.isArray(codes) || codes.some(code => typeof code !== 'string')) failure('Choose subject codes from the curriculum.');
    const failed = failedRows(student.id);
    const choice = choiceFor(student.id);
    if (failed.length && !choice) failure('The student must decide which back subjects to take before Department Head evaluation.', 409);
    if (failed.length && codes?.some(code => failed.some(row => row.code === String(code).trim().toUpperCase()) && !choice.codes.includes(String(code).trim().toUpperCase()))) failure('The student deferred this back subject. Obtain a new student decision before assigning it.', 409);
    const expectedRole = student.student_type === 'regular' && !failed.length ? 'registrar' : 'department_head';
    if (actor?.role !== expectedRole) failure(`Only the ${expectedRole === 'registrar' ? 'Registrar' : 'Department Head'} can assign this student's subjects.`, 403);
    if (!student.reviewed_at || student.status !== 'Active') failure('Review this active student registration before assignment.', 409);
    if (!Array.isArray(codes) || !codes.length || codes.length > 12 || codes.some(code => typeof code !== 'string') || new Set(codes).size !== codes.length) failure('Choose 1 to 12 distinct subjects.');
    const plan = currentPlan(student);
    if (plan && !['draft', 'declined'].includes(plan.status)) failure('The offered enrollment must be declined before reassignment.', 409);
    const subjects = codes.map(code => checkSubject(student, code.trim().toUpperCase(), expectedRole === 'registrar'));
    if (new Set(subjects.map(subject => subject.id)).size !== subjects.length) failure('Choose distinct subjects.');
    db.prepare("INSERT INTO enrollment_plans(student_id,term_id,assigned_by) VALUES(?,?,?) ON CONFLICT(student_id,term_id) DO UPDATE SET status='draft',revision=revision+1,assigned_by=excluded.assigned_by,updated_at=CURRENT_TIMESTAMP").run(student.id, activeTerm().id, actorId(actor));
    const id = currentPlan(student).id;
    db.prepare('DELETE FROM plan_subjects WHERE plan_id=?').run(id);
    db.prepare('DELETE FROM plan_sections WHERE plan_id=?').run(id);
    for (const subject of subjects) db.prepare('INSERT INTO plan_subjects VALUES(?,?)').run(id, subject.id);
    audit(actor, 'assign', 'enrollment', `${student.number}:${activeTerm().id}`);
  }
  function assignSubjects(number, codes, actor) {
    return transaction(() => { writeAssignment(studentRecord(number), codes, actor); return plans().find(plan => plan.studentId === number && plan.termId === activeTerm().id); });
  }
  function offerPlan(number, sectionIds, actor, blockTermId = null) {
    if (actor?.role !== 'registrar') failure('Only the Registrar can offer schedules.', 403);
    if (blockTermId === null && (!Array.isArray(sectionIds) || !sectionIds.length || sectionIds.length > 12 || new Set(sectionIds).size !== sectionIds.length)) failure('Choose 1 to 12 distinct sections.');
    return transaction(() => {
      const student = studentRecord(number);
      const home=homeBlock(number);
      if (student.student_type==='regular' && home) {
        const expected=blockOfferSections(student,blockTermId);
        if (blockTermId!==null) sectionIds=expected.sectionIds;
        if (JSON.stringify([...sectionIds].sort())!==JSON.stringify([...expected.sectionIds].sort())) failure('Regular students must receive their home block schedule. Transfer their home block through the Registrar first.',409);
        blockTermId=expected.id;
        writeAssignment(student,expected.codes,actor);
      } else if (blockTermId!==null) failure('Only regular students with an assigned home block can receive a complete block offer.',409);
      const sections = sectionIds.map(id => {
        const section = db.prepare('SELECT s.*,sub.code FROM sections s JOIN subjects sub ON sub.id=s.subject_id WHERE s.public_id=? AND s.term_id=?').get(id, activeTerm().id);
        if (!section) failure('Choose sections in the active term.', 409);
        if (!catalogSectionMatches(section.public_id,student.program)) failure('This historical section does not match the selected curriculum subject. Create a section using the curriculum title.',409);
        return section;
      });
      let plan = currentPlan(student);
      if (!plan || plan.status === 'declined') {
        writeAssignment(student, sections.map(section => section.code), actor);
        plan = currentPlan(student);
      }
      if (plan.status !== 'draft') failure('An offer already exists for this term.', 409);
      const assigned = db.prepare('SELECT subject_id FROM plan_subjects WHERE plan_id=?').all(plan.id).map(row => row.subject_id);
      if (assigned.length !== sections.length || new Set(sections.map(section => section.subject_id)).size !== sections.length || sections.some(section => !assigned.includes(section.subject_id))) failure('Choose exactly one section for each assigned subject.', 409);
      // Revalidate curriculum and prerequisites after any edits since assignment.
      for (const section of sections) checkSubject(student, section.code, student.student_type === 'regular');
      for (const section of sections) {
        insertAllocation(number, section.public_id, actor);
        db.prepare('INSERT INTO plan_sections VALUES(?,?)').run(plan.id, section.id);
      }
      db.prepare("UPDATE enrollment_plans SET status='pending',block_term_id=?,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=?").run(blockTermId,plan.id);
      audit(actor, 'offer', 'enrollment', `${number}:${activeTerm().id}`);
      return plans().find(row => row.id === plan.id);
    });
  }
  function respondPlan(number, status, revision, actor) {
    if (actor?.role !== 'student' || actor.id !== number) failure('Only the student can respond to their own enrollment.', 403);
    if (!['accepted', 'declined'].includes(status)) failure('Choose accepted or declined.');
    return transaction(() => {
      const student = studentRecord(number), plan = currentPlan(student);
      if (!plan) failure('No enrollment offer was found.', 404);
      if (plan.revision !== Number(revision)) failure('The enrollment has changed. Reload before responding.', 409);
      if (plan.status === status) return plans().find(row => row.id === plan.id);
      if (plan.status !== 'pending') failure('Only a pending offer can be accepted or declined.', 409);
      db.prepare('UPDATE enrollment_plans SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').run(status, plan.id);
      if (status === 'declined') db.prepare('DELETE FROM enrollments WHERE student_id=? AND section_id IN(SELECT section_id FROM plan_sections WHERE plan_id=?)').run(student.id, plan.id);
      audit(actor, status, 'enrollment', `${number}:${activeTerm().id}`);
      return plans().find(row => row.id === plan.id);
    });
  }
  function confirmPlan(number, actor) {
    if (actor?.role !== 'registrar') failure('Only the Registrar can confirm enrollments.', 403);
    return transaction(() => {
      const student = studentRecord(number), plan = currentPlan(student);
      if (!plan) failure('No enrollment was found.', 404);
      if (plan.status === 'confirmed') return plans().find(row => row.id === plan.id);
      if (plan.status !== 'accepted' || student.status !== 'Active') failure('The student must accept the offer before confirmation.', 409);
      db.prepare("UPDATE enrollment_plans SET status='confirmed',updated_at=CURRENT_TIMESTAMP WHERE id=?").run(plan.id);
      audit(actor, 'confirm', 'enrollment', `${number}:${activeTerm().id}`);
      return plans().find(row => row.id === plan.id);
    });
  }
  function studentView(number) {
    const student = studentRecord(number), plan = plans().find(row => row.studentId === number && row.termId === activeTerm().id) || null;
    const classes = !plan || ['draft', 'declined'].includes(plan.status) ? [] : db.prepare('SELECT sub.code,COALESCE(s.title_override,sub.title) AS title,sub.units,s.label AS section,s.day,s.start,s.end,s.room,s.instructor,s.start_date AS startDate,s.end_date AS endDate FROM plan_sections ps JOIN sections s ON s.id=ps.section_id JOIN subjects sub ON sub.id=s.subject_id WHERE ps.plan_id=? ORDER BY s.day,s.start').all(plan.id);
    return { homeBlock:homeBlock(number), backSubjects: { failed: failedRows(student.id), choice: choiceFor(student.id), reviewed: Boolean(student.reviewed_at) }, id: number, name: `${student.first} ${student.last}`, reviewed: Boolean(student.reviewed_at), updatedAt: plan?.updatedAt || student.reviewed_at || student.updated_at, term: activeTerm().label, classes:classes.map(row=>({...row,section:classBlockLabelByMeeting(plan.id,row.code) || row.section})), plan: plan ? (({ assignedBy, ...row }) => row)(plan) : null, history: plans().filter(row => row.studentId === number).map(({ assignedBy, ...row }) => row) };
  }
  function reports(filters = {}, actor) {
    if (!['registrar', 'department_head'].includes(actor?.role)) failure('Staff access is required.', 403);
    const visible = new Map(list(actor).students.map(student => [student.id, student]));
    const allPlans = plans();
    const rows = allPlans.filter(plan => visible.has(plan.studentId) && (!filters.term || plan.termId === filters.term) && (!filters.status || plan.status === filters.status)).map(plan => {
      const student = visible.get(plan.studentId);
      return { studentId: student.id, name: `${student.first} ${student.last}`, program: student.program, level: student.level, termId: plan.termId, term: db.prepare('SELECT label FROM terms WHERE id=?').get(plan.termId).label, status: plan.status, subjects: plan.subjects.join(', '), sections: plan.sectionIds.join(', ') };
    });
    if ((!filters.term || filters.term === activeTerm().id) && (!filters.status || filters.status === 'unassigned')) {
      for (const student of visible.values()) if (!allPlans.some(plan => plan.studentId === student.id && plan.termId === activeTerm().id)) rows.push({ studentId: student.id, name: `${student.first} ${student.last}`, program: student.program, level: student.level, termId: activeTerm().id, term: activeTerm().label, status: 'unassigned', subjects: '', sections: '' });
    }
    return rows.filter(row => !filters.program || row.program === filters.program);
  }
  function auditHistory(actor) {
    if (!['registrar', 'department_head'].includes(actor?.role)) failure('Staff access is required.', 403);
    const ids = new Set(list(actor).students.map(student => student.id));
    return db.prepare('SELECT id,COALESCE(actor_label,actor_id) AS actor,action,entity,entity_id AS entityId,at FROM audit_log ORDER BY id DESC').all().filter(row => actor.role === 'registrar' || (row.entity === 'enrollment' && ids.has(row.entityId.split(':')[0])));
  }
  return { createBlock, assignHomeBlock, createBlockTerm, addBlockClass, linkBlockClass, offerBlockPlan, importCurriculum, evaluation, recordResults, chooseBackSubjects, resources, addResource, issueReset, redeemReset, close: () => db.close(), publicTerm: activeTerm, list, createTerm, activateTerm, addStudent, registerStudent, reviewStudent, studentStatus, registrarPassword, setRegistrarPassword, updateStudent, addSection, allocate, allocateMany, completeSubject, drop, importData, staffPassword, setStaffPassword, studentPassword, setStudentPassword, studentByCredentials, limitedPublicStatus, studentView, addCurriculum, assignSubjects, offerPlan, respondPlan, confirmPlan, reports, auditHistory };
}
