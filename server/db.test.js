import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from './db.js';

test('student numbers and allocations stay valid in the database', () => {
  const store = openStore(':memory:');
  try {
    const base = { birth: '01/01/2008', gender: 'Female', address: 'Test address', phone: '0000000', program: 'BS Computer Science', level: '1st year', admitted: '10/01/2026', status: 'Active' };
    const first = store.addStudent({ ...base, first: 'Ada', last: 'Santos', email: 'ada@example.test' }, null);
    const second = store.addStudent({ ...base, first: 'Mina', last: 'Reyes', email: 'mina@example.test' }, null);
    assert.match(first.id, /^\d{2}-00001$/);
    assert.equal(second.id.slice(0, 2), first.id.slice(0, 2));
    assert.equal(second.id.slice(3), '00002');
    const firstSection = store.addSection({ code: 'CS 101', title: 'Computing', section: 'A', instructor: 'Prof. Lee', day: 'Monday', start: '09:00', end: '10:00', room: 'Lab 1', capacity: 1 }, null);
    const clash = store.addSection({ code: 'CS 102', title: 'Programming', section: 'A', instructor: 'Prof. Tan', day: 'Monday', start: '09:30', end: '10:30', room: 'Lab 2', capacity: 20 }, null);
    store.allocate(first.id, firstSection.id, null);
    assert.throws(() => store.allocate(first.id, firstSection.id, null), /already allocated/);
    assert.throws(() => store.allocate(second.id, firstSection.id, null), /no available seats/);
    assert.throws(() => store.allocate(first.id, clash.id, null), /conflicts/);
    assert.equal(store.list().enrollments.length, 1);
    store.drop(first.id, firstSection.id, null);
    assert.equal(store.list().enrollments.length, 0);
  } finally { store.close(); }
});

test('academic terms keep student IDs while separating sections and enrollments', () => {
  const store = openStore(':memory:');
  try {
    const student = store.addStudent({ first: 'Lea', last: 'Cruz', birth: '01/01/2007', gender: 'Female', address: 'Test address', phone: '0000000', email: 'lea@example.test', program: 'BS CS', level: '2nd year', admitted: '10/01/2026', status: 'Active' }, null);
    const section = { code: 'CS 201', title: 'Data Structures', section: 'A', instructor: 'Prof. Lim', day: 'Tuesday', start: '09:00', end: '10:00', room: 'Lab 2', capacity: 20 };
    const oldSection = store.addSection(section, null);
    store.allocate(student.id, oldSection.id, null);
    store.createTerm({ year: 2027, semester: 1 }, null);
    assert.equal(store.list().students[0].id, student.id);
    assert.equal(store.list().sections.length, 0);
    assert.equal(store.list().enrollments.length, 0);
    const newSection = store.addSection(section, null);
    assert.throws(() => store.allocate(student.id, oldSection.id, null), /active term/);
    store.allocate(student.id, newSection.id, null);
    assert.equal(store.list().terms.find(term => term.id === '2027-1').enrollments, 1);
    store.activateTerm('2026-1', null);
    assert.equal(store.list().enrollments[0].sectionId, oldSection.id);
    assert.throws(() => store.createTerm({ year: 2027, semester: 1 }, null), /already exists/);
  } finally { store.close(); }
});

test('registration reuses existing identity and prerequisites gate allocation', () => {
  const store = openStore(':memory:');
  try {
    const person = { first: 'Ava', last: 'Tan', birth: '01/02/2008', gender: 'Female', address: 'Test address', phone: '0000000', email: 'ava@example.test', program: 'BS CS', level: '1st year', admitted: '10/01/2026', status: 'Active' };
    const student = store.addStudent(person, null);
    assert.throws(() => store.addStudent({ ...person, email: 'other@example.test' }, null), new RegExp(student.id));
    store.addSection({ code: 'CS 101', title: 'Foundations', section: 'A', instructor: 'Prof. A', day: 'Monday', start: '08:00', end: '09:00', room: 'R1', capacity: 10 }, null);
    const advanced = store.addSection({ code: 'CS 201', title: 'Advanced', section: 'A', instructor: 'Prof. B', day: 'Tuesday', start: '08:00', end: '09:00', room: 'R2', capacity: 1, prerequisites: 'CS 101' }, null);
    assert.equal(store.list().sections.find(item => item.id === advanced.id).prerequisites, 'CS 101');
    assert.throws(() => store.allocate(student.id, advanced.id, null), /Prerequisite not completed/);
    store.completeSubject(student.id, 'CS 101', null);
    store.allocate(student.id, advanced.id, null);
    assert.equal(store.list().enrollments.length, 1);
  } finally { store.close(); }
});
