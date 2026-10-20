import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from './db.js';

const registrar = { role: 'registrar', id: 'registrar' };
const head = { role: 'department_head', id: 'department_head' };
const person = {
  first: 'Evaluation', last: 'Learner', birth: '01/02/2008', gender: 'Unspecified',
  address: 'Sample address', phone: '0000000', email: 'evaluation@example.test',
  program: 'BS Information Technology', level: '1st year', admitted: '10/01/2026',
  semester: 1, consent: true,
};
const foundation = { code: 'EX101', title: 'Sample foundations', units: 3, program: person.program, yearLevel: 1, semester: 1 };
const advanced = { ...foundation, code: 'EX102', title: 'Sample advanced', prerequisites: 'EX101' };
const meeting = { section: 'A', instructor: 'Sample professor', room: 'Sample room', day: 'Monday', start: '09:00', end: '10:00', capacity: 10 };

function fixture(t, { reviewed = true } = {}) {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const student = reviewed ? store.addStudent(person, registrar) : store.registerStudent(person);
  store.addCurriculum(foundation, registrar);
  store.addCurriculum(advanced, registrar);
  const first = store.addSection({ ...foundation, ...meeting }, registrar);
  const second = store.addSection({ ...advanced, ...meeting, day: 'Tuesday' }, registrar);
  return { store, student, first, second, actor: { role: 'student', id: student.id } };
}

function record(store, student, remark = 'failed', grade = remark === 'passed' ? '3.0' : remark === 'not_taken' ? '' : '5.0') {
  return store.recordResults(student.id, [{ code: 'EX101', grade, remark }], registrar);
}

function completed(store, student) {
  return store.list(registrar).completed.filter(row => row.studentId === student.id).map(row => row.code).sort();
}

test('evaluation imports roll back all rows and completion changes when a later CSV row is invalid', t => {
  const { store, student } = fixture(t);
  record(store, student, 'passed');
  assert.deepEqual(completed(store, student), ['EX101']);
  const before = store.evaluation(student.id, registrar);
  const audit = store.auditHistory(registrar);
  for (const badRow of [
    { code: 'MISSING', grade: '5.0', remark: 'failed' },
    { code: 'EX102', grade: '5.0', remark: 'unknown' },
    { code: 'EX102', grade: '5.0', remark: 'failed', termId: 'missing-term' },
    { code: 'EX102', grade: '5.0', remark: 'passed' },
    { code: 'EX102', grade: '1.0', remark: 'failed' },
    { code: 'EX102', grade: '4.0', remark: 'failed' },
  ]) {
    assert.throws(() => store.recordResults(student.id, [
      { code: 'EX101', grade: '5.0', remark: 'failed' }, badRow,
    ], registrar), error => [400, 409, 422].includes(error.status));
    assert.deepEqual(store.evaluation(student.id, registrar), before);
    assert.deepEqual(completed(store, student), ['EX101']);
    assert.deepEqual(store.auditHistory(registrar), audit);
  }
  record(store, student);
  const evaluated = store.evaluation(student.id, registrar);
  assert.equal(evaluated.results.filter(row => row.code === 'EX101').length, 1, 're-evaluation upserts the current result');
  assert.equal(evaluated.results.find(row => row.code === 'EX101').remark, 'failed');
  assert.equal(evaluated.student.studentType, 'back_subject');
  assert.deepEqual(completed(store, student), [], 'failed result removes prior completion');
  record(store, student, 'not_taken');
  assert.deepEqual(completed(store, student), []);
  assert.equal(store.evaluation(student.id, registrar).results.find(row => row.code === 'EX101').remark, 'not_taken');
});

test('failed prerequisites and a deferred back subject block assignment until the student chooses a retake', t => {
  const { store, student, actor } = fixture(t);
  record(store, student);
  const evaluated = store.evaluation(student.id, registrar);
  assert.equal(evaluated.needsBackSubjectDecision, true);
  const dependent = evaluated.curriculum.find(row => row.code === 'EX102');
  assert.equal(dependent.eligible, false);
  assert.deepEqual(dependent.missingPrerequisites, ['EX101']);
  assert.ok(dependent.blockedReasons.length);
  assert.throws(() => store.assignSubjects(student.id, ['EX101'], head), /choice|choose|decision|back.subject/i);
  store.chooseBackSubjects(student.id, [], actor);
  assert.equal(store.evaluation(student.id, registrar).needsBackSubjectDecision, false);
  assert.throws(() => store.assignSubjects(student.id, ['EX101'], head), /defer|chosen|selected|choice|retake/i);
  store.chooseBackSubjects(student.id, ['EX101'], actor);
  assert.throws(() => store.assignSubjects(student.id, ['EX101'], registrar), /Department Head/i);
  assert.throws(() => store.assignSubjects(student.id, ['EX102'], head), /prerequisite/i);
  assert.equal(store.list(registrar).plans.length, 0);
  const assigned = store.assignSubjects(student.id, ['EX101'], head);
  assert.equal(assigned.status, 'draft');
  assert.deepEqual(assigned.subjects, ['EX101']);
});

test('numeric results follow every confirmed conversion boundary and reject invalid input without writes', t => {
  const { store, student } = fixture(t);
  const bands = [[97.5, 1], [94.5, 1.25], [91.5, 1.5], [88.5, 1.75], [85.5, 2], [82.5, 2.25], [79.5, 2.5], [76.5, 2.75], [74.5, 3]];
  const checks = [[0, 5], [100, 1]];
  for (let index = 0; index < bands.length; index++) {
    const [threshold, grade] = bands[index];
    checks.push([threshold, grade], [Number((threshold - 0.01).toFixed(2)), bands[index + 1]?.[1] ?? 5]);
  }
  for (const [rawGrade, grade] of checks) {
    store.recordResults(student.id, [{ code: 'EX101', rawGrade }], registrar);
    const result = store.evaluation(student.id, registrar).results.find(row => row.code === 'EX101');
    assert.equal(Number(result.rawGrade), rawGrade, `raw ${rawGrade} is preserved`);
    assert.equal(Number(result.grade), grade, `raw ${rawGrade} converts to ${grade}`);
    assert.equal(result.remark, grade === 5 ? 'failed' : 'passed');
    assert.deepEqual(completed(store, student), grade === 5 ? [] : ['EX101']);
  }
  for (const grade of [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3, 5]) {
    store.recordResults(student.id, [{ code: 'EX101', grade }], registrar);
    assert.equal(store.evaluation(student.id, registrar).results[0].remark, grade === 5 ? 'failed' : 'passed');
  }
  const before = store.evaluation(student.id, registrar);
  for (const invalid of [
    ...[-0.01, 100.01, 74.499, 'not-a-number'].map(rawGrade => ({ rawGrade })),
    ...[0, 1.1, 3.25, 4, 6].map(grade => ({ grade })),
    { grade: 5, remark: 'passed' }, { grade: 3, remark: 'failed' },
    { rawGrade: 70, grade: 1 }, { rawGrade: 90, remark: 'failed' },
    { remark: 'unsupported' },
  ]) {
    assert.throws(() => store.recordResults(student.id, [{ code: 'EX101', ...invalid }], registrar), { status: 422 }, JSON.stringify(invalid));
    assert.deepEqual(store.evaluation(student.id, registrar), before);
  }
});

test('back subject choices require review, failed results, and the owning student actor', t => {
  const { store, student, actor } = fixture(t, { reviewed: false });
  record(store, student);
  assert.throws(() => store.chooseBackSubjects(student.id, ['EX101'], actor), /review/i);
  store.reviewStudent(student.id, registrar);
  const other = store.addStudent({ ...person, first: 'Other', email: 'other-evaluation@example.test' }, registrar);
  for (const impostor of [registrar, head, { role: 'student', id: other.id }]) {
    assert.throws(() => store.chooseBackSubjects(student.id, ['EX101'], impostor), /own|student|access/i);
  }
  assert.throws(() => store.chooseBackSubjects(student.id, ['EX102'], actor), /failed/i);
  assert.throws(() => store.chooseBackSubjects(other.id, [], { role: 'student', id: other.id }), /failed/i);
  assert.equal(store.evaluation(student.id, registrar).needsBackSubjectDecision, true);
  store.chooseBackSubjects(student.id, ['EX101'], actor);
  assert.equal(store.evaluation(student.id, registrar).needsBackSubjectDecision, false);
});

test('draft assignments and published offers freeze the student back subject choice', t => {
  const { store, student, first, actor } = fixture(t);
  record(store, student);
  store.chooseBackSubjects(student.id, ['EX101'], actor);
  store.assignSubjects(student.id, ['EX101'], head);
  for (const publish of [false, true]) {
    if (publish) assert.equal(store.offerPlan(student.id, [first.id], registrar).status, 'pending');
    const before = store.evaluation(student.id, registrar);
    assert.throws(() => store.chooseBackSubjects(student.id, [], actor), /plan|assign|draft|offer|schedule|evaluation.*started/i);
    assert.deepEqual(store.evaluation(student.id, registrar), before);
  }
});

test('result changes invalidate pending decisions and drafts while published grades stay immutable and public lookup stays minimal', t => {
  const { store, student, first, actor } = fixture(t);
  record(store, student);
  store.chooseBackSubjects(student.id, ['EX101'], actor);
  store.recordResults(student.id, [{ code: 'EX101', rawGrade: 70 }], registrar);
  assert.equal(store.evaluation(student.id, registrar).needsBackSubjectDecision, true);
  store.chooseBackSubjects(student.id, ['EX101'], actor);
  store.assignSubjects(student.id, ['EX101'], head);
  store.recordResults(student.id, [{ code: 'EX101', rawGrade: 71 }], registrar);
  const invalidated = store.evaluation(student.id, registrar);
  assert.equal(invalidated.needsBackSubjectDecision, true);
  assert.ok(!invalidated.plan || invalidated.plan.subjects.length === 0, 'stale draft subjects must be removed');
  assert.throws(() => store.offerPlan(student.id, [first.id], registrar), /choice|choose|decision|assign|Department Head|subject/i);
  store.chooseBackSubjects(student.id, ['EX101'], actor);
  store.assignSubjects(student.id, ['EX101'], head);
  store.offerPlan(student.id, [first.id], registrar);
  const published = store.evaluation(student.id, registrar);
  const allocations = store.list(registrar).enrollments;
  assert.throws(() => record(store, student, 'passed'), /offer|publish|plan|declin|enrollment/i);
  assert.deepEqual(store.evaluation(student.id, registrar), published);
  assert.deepEqual(store.list(registrar).enrollments, allocations);
  assert.deepEqual(completed(store, student), []);
  const lookup = store.limitedPublicStatus(student.id, person.email, person.birth);
  assert.deepEqual(Object.keys(lookup).sort(), ['hasAccount', 'id', 'reviewed', 'term', 'updatedAt']);
  assert.equal(lookup.id, student.id);
  assert.equal(lookup.reviewed, true);
});

test('room capacity and separate room and professor conflicts remain server enforced', t => {
  const { store } = fixture(t);
  store.addResource({ kind: 'room', name: 'Capacity room', capacity: 2 }, registrar);
  store.addResource({ kind: 'professor', name: 'Capacity professor' }, registrar);
  const section = { ...foundation, ...meeting, section: 'Resource', room: 'Capacity room', instructor: 'Capacity professor', day: 'Wednesday', capacity: 3 };
  const before = store.list(registrar).sections;
  assert.throws(() => store.addSection(section, registrar), /capacity/i);
  assert.deepEqual(store.list(registrar).sections, before);
  const added = store.addSection({ ...section, capacity: 2 }, registrar);
  assert.ok(added.id);
  for (const conflict of [
    { room: 'Capacity room', instructor: 'Other professor' },
    { room: 'Other room', instructor: 'Capacity professor' },
  ]) {
    assert.throws(() => store.addSection({ ...section, ...conflict, section: 'Conflict', capacity: 2, start: '09:30', end: '10:30' }, registrar), /room|instructor|professor|scheduled|conflict/i);
  }
  assert.equal(store.list(registrar).sections.length, before.length + 1);
  assert.ok(store.addSection({ ...section, section: 'Adjacent', capacity: 2, start: '10:00', end: '11:00' }, registrar).id);
});

test('legacy completion continues satisfying prerequisites until explicitly replaced by an evaluated result', t => {
  const { store, student } = fixture(t);
  store.completeSubject(student.id, 'EX101', registrar);
  assert.deepEqual(completed(store, student), ['EX101']);
  const evaluated = store.evaluation(student.id, registrar);
  assert.equal(evaluated.needsBackSubjectDecision, false);
  assert.equal(evaluated.curriculum.find(row => row.code === 'EX102').eligible, true);
  assert.deepEqual(evaluated.curriculum.find(row => row.code === 'EX102').missingPrerequisites, []);
  assert.deepEqual(store.assignSubjects(student.id, ['EX102'], registrar).subjects, ['EX102']);
  record(store, student);
  assert.deepEqual(completed(store, student), []);
  assert.equal(store.evaluation(student.id, registrar).curriculum.find(row => row.code === 'EX102').eligible, false);
});


test('batched academic results preserve program-specific titles for a shared code', t => {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const subject = {code:'SHARED',title:'Example first title',units:3,program:'Example program one',yearLevel:1,semester:1,prerequisites:'',minimumYear:0,minimumPassedUnits:0};
  store.importCurriculum({version:'Example version',subjects:[subject,{...subject,program:'Example program two',title:'Example second title'}]},registrar);
  const first = store.addStudent({...person,program:subject.program},registrar);
  const second = store.addStudent({...person,first:'Second',email:'second@example.test',program:'Example program two'},registrar);
  for(const student of [first,second]) store.recordResults(student.id,[{code:'SHARED',grade:'2.00'}],registrar);
  const results=store.list(registrar).results;
  assert.equal(results.find(row=>row.studentId===first.id).title,'Example first title');
  assert.equal(results.find(row=>row.studentId===second.id).title,'Example second title');
  assert.equal('program' in results[0],false,'internal join columns do not change the API record shape');
});

test('duplicate room and professor names return actionable errors without adding records', t => {
  const store=openStore(':memory:');
  t.after(()=>store.close());
  for(const kind of ['room','professor']) {
    const resource={kind,name:kind==='room'?'Example Lab':'Example Professor',...(kind==='room'?{capacity:30}:{})};
    store.addResource(resource,registrar);
    assert.throws(()=>store.addResource({...resource,name:' '+resource.name.toLowerCase()+' '},registrar),error=>error.status===409 && /already exists in the catalog/.test(error.message));
  }
  assert.equal(store.resources().length,2);
});
