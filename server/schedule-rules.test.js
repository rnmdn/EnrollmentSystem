import test from 'node:test';
import assert from 'node:assert/strict';
import { meetingsOverlap } from '../schedule-rules.js';
import { openStore } from './db.js';

const meeting = { day: 'Monday', start: '09:00', end: '10:00', startDate: '2026-10-01', endDate: '2026-10-31' };
test('client meeting checks respect academic dates, touching times and unspecified ranges', () => {
  assert.equal(meetingsOverlap(meeting, { ...meeting, startDate: '2026-11-01', endDate: '2026-11-30' }), false);
  assert.equal(meetingsOverlap(meeting, { ...meeting, startDate: '2026-10-31', endDate: '2026-11-30' }), true);
  assert.equal(meetingsOverlap(meeting, { ...meeting, start: '10:00', end: '11:00' }), false);
  assert.equal(meetingsOverlap(meeting, { ...meeting, day: 'Tuesday' }), false);
  assert.equal(meetingsOverlap(meeting, { ...meeting, startDate: null, endDate: null }), true);
  assert.equal(meetingsOverlap({ ...meeting, startDate: null, endDate: null }, meeting), true);
});

test('date-aware client selection agrees with server offers and preserves conflict rollback', () => {
  const store = openStore(':memory:');
  const registrar = { role: 'registrar', id: 'registrar' };
  try {
    const person = { first: 'Date', last: 'Example', email: 'dates@example.test', birth: '01/01/2008', gender: 'Unspecified', phone: '0000', address: 'Fictional address', program: 'Sample program', level: '1st year', admitted: '10/01/2026' };
    const student = store.addStudent(person, registrar);
    const sections = [
      { code: 'DATE1', title: 'First short course', ...meeting },
      { code: 'DATE2', title: 'Second short course', ...meeting, startDate: '2026-11-01', endDate: '2026-11-30' },
      { code: 'DATE3', title: 'Overlapping course', ...meeting, room: 'Other room', instructor: 'Other professor' }
    ].map(subject => {
      store.addCurriculum({ ...subject, program: person.program, yearLevel: 1, semester: 1, units: 3 }, registrar);
      return { ...subject, ...store.addSection({ room: 'Same room', instructor: 'Same professor', section: 'A', capacity: 10, ...subject }, registrar) };
    });
    assert.equal(meetingsOverlap(sections[0], sections[1]), false);
    assert.equal(meetingsOverlap(sections[0], sections[2]), true);
    assert.throws(() => store.offerPlan(student.id, [sections[0].id, sections[2].id], registrar), /conflicts/);
    assert.equal(store.list(registrar).enrollments.length, 0);
    assert.equal(store.offerPlan(student.id, [sections[0].id, sections[1].id], registrar).status, 'pending');
    assert.equal(store.list(registrar).enrollments.length, 2);
  } finally { store.close(); }
});
