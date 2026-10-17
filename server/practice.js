import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hash } from 'bcryptjs';
import { openStore } from './db.js';
import { startServer } from './http.js';
import { plpCurriculum2022 } from '../curriculum/plp-2022.js';

const databasePath = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'practice.sqlite');
const registrar = { role: 'registrar', id: 'registrar' };
const regularEmail = 'example.regular@example.test';
const irregularEmail = 'example.irregular@example.test';
const passwords = {
  registrar: 'PracticeRegistrar2026!',
  head: 'PracticeHead2026!',
  student: 'PracticeStudent2026!',
};

// Only this isolated entry point installs practice credentials and synthetic data.
export async function seedPractice(store) {
  for (const method of ['recordResults', 'addResource']) {
    if (typeof store[method] !== 'function') {
      throw new Error(`Practice requires store.${method}; finish the store APIs before running npm run practice.`);
    }
  }
  store.importCurriculum(plpCurriculum2022,registrar);
  const initial = store.list(registrar);
  if (initial.students.length) {
    const regular = initial.students.find(student => student.email === regularEmail);
    const irregular = initial.students.find(student => student.email === irregularEmail);
    if (!regular || !irregular || !store.studentPassword(regular.id) || !store.studentPassword(irregular.id)) {
      throw new Error('Practice database is occupied or incompletely seeded. Inspect data/practice.sqlite before retrying; no seed data was changed.');
    }
    seedPracticeBlocks(store,regular,irregular);
    return { regular, irregular, seeded: false };
  }
  const term = store.publicTerm();
  if (!term || !term.id.endsWith('-1')) throw new Error('Practice seeding requires an active Semester 1 term.');

  const [registrarHash, headHash, studentHash] = await Promise.all([
    hash(passwords.registrar, 12), hash(passwords.head, 12), hash(passwords.student, 12),
  ]);
  store.setStaffPassword('registrar', registrarHash);
  store.setStaffPassword('department_head', headHash);

  const program = 'BS Information Technology';
  const subjects = [
    { code: 'EX101', title: 'Example Computing Foundations', prerequisites: '' },
    { code: 'EX102', title: 'Example Programming II', prerequisites: 'EX101' },
  ];
  for (const subject of subjects) {
    store.addCurriculum({ ...subject, program, yearLevel: 1, semester: 1, units: 3 }, registrar);
  }
  for (const suffix of ['A', 'B']) {
    store.addResource({ kind: 'room', name: `Example Room ${suffix}`, capacity: 20 }, registrar);
    store.addResource({ kind: 'professor', name: `Example Professor ${suffix}` }, registrar);
  }
  for (const [index, subject] of subjects.entries()) {
    const suffix = index === 0 ? 'A' : 'B';
    store.addSection({
      ...subject, section: `EX-${suffix}`, day: 'Monday',
      start: index === 0 ? '08:00' : '09:00', end: index === 0 ? '09:00' : '10:00',
      room: `Example Room ${suffix}`, instructor: `Example Professor ${suffix}`, capacity: 20,
    }, registrar);
  }

  const todayManila = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', month: '2-digit', day: '2-digit', year: 'numeric',
  }).format(new Date());
  const person = {
    first: 'Example', birth: '01/01/2008', gender: 'Unspecified',
    address: 'Example synthetic address', phone: '00000000000', program,
    level: '1st year', admitted: todayManila, semester: 1, status: 'Active',
  };
  const regular = store.addStudent({ ...person, last: 'Regular', email: regularEmail, studentType: 'regular' }, registrar);
  store.recordResults(regular.id, [{ code: 'EX101', grade: '2.0', remark: 'Passed', termId: term.id }], registrar);
  store.setStudentPassword(regular.id, studentHash);
  const irregular = store.addStudent({ ...person, last: 'Irregular', email: irregularEmail, studentType: 'back_subject' }, registrar);
  store.recordResults(irregular.id, [{ code: 'EX101', grade: '5.0', remark: 'Failed', termId: term.id }], registrar);
  store.setStudentPassword(irregular.id, studentHash);
  seedPracticeBlocks(store,regular,irregular);
  return { regular, irregular, seeded: true };
}

function seedPracticeBlocks(store,regular,irregular) {
  for (const [student,groupCode,code] of [[regular,'A','EX102'],[irregular,'B','EX101']]) {
    let data=store.list(registrar);
    const cohortYear=2000+Number(student.id.slice(0,2));
    const block=data.blocks.find(row=>row.program===student.program && row.cohortYear===cohortYear && row.groupCode===groupCode) || store.createBlock({program:student.program,groupCode,cohortYear,capacity:20},registrar);
    if (!data.students.find(row=>row.id===student.id)?.homeBlock) store.assignHomeBlock(student.id,{blockId:block.id},registrar);
    if (data.term.id!=='2026-1') continue;
    const term=data.blockTerms.find(row=>row.blockId===block.id) || store.createBlockTerm({blockId:block.id,yearLevel:1,source:''},registrar);
    const section=data.sections.find(row=>row.code===code);
    if (section && !section.blockLabel && !data.plans.some(plan=>plan.sectionIds.includes(section.id))) store.linkBlockClass(term.id,section.id,registrar);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const store = openStore(databasePath);
  try {
    const { regular, irregular, seeded } = await seedPractice(store);
    const server = startServer(3004, databasePath, { store, practice: true });
    server.on('listening', () => {
      console.log(`PRACTICE ONLY: http://127.0.0.1:3004 — ${databasePath}`);
      console.log(seeded ? 'Synthetic examples seeded; these are not an approved school curriculum.' : 'Existing practice data retained.');
      console.log(`PRACTICE ONLY registrar password: ${passwords.registrar}`);
      console.log(`PRACTICE ONLY Department Head password: ${passwords.head}`);
      console.log(`PRACTICE ONLY Example Regular: ${regular.id}; Example Irregular: ${irregular.id}`);
      console.log(`PRACTICE ONLY student password (both accounts): ${passwords.student}`);
    });
  } catch (error) {
    store.close();
    console.error(`Practice startup failed: ${error.message}`);
    process.exitCode = 1;
  }
}
