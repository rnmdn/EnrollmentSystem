import test from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from './db.js';
import { plpCurriculum2022 as catalog } from '../curriculum/plp-2022.js';

const registrar={role:'registrar',id:'registrar'}, head={role:'department_head',id:'department_head'};
const person={first:'Curriculum',last:'Example',email:'curriculum@example.test',birth:'01/01/2008',gender:'Unspecified',address:'Example address',phone:'0000000',program:'BS Computer Science',level:'2nd year',admitted:'10/01/2026'};
const meeting={section:'A',instructor:'Example professor',room:'Example room',day:'Monday',start:'09:00',end:'10:00',capacity:20};

test('both transcribed curricula match their semester totals and include all referenced prerequisites',()=>{
  const expected={
    'BS Information Technology':[[1,1,20],[1,2,23],[2,1,23],[2,2,23],[3,1,21],[3,2,15],[3,3,6],[4,1,9],[4,2,6]],
    'BS Computer Science':[[1,1,20],[1,2,23],[2,1,20],[2,2,23],[3,1,23],[3,2,18],[3,3,3],[4,1,10],[4,2,6]],
  };
  for (const source of catalog.sources) {
    const rows=catalog.subjects.filter(row=>row.program===source.program);
    assert.equal(rows.length,source.expectedSubjects);
    assert.equal(rows.reduce((sum,row)=>sum+row.units,0),146);
    assert.equal(new Set(rows.map(row=>row.code)).size,rows.length);
    for (const [year,semester,total] of expected[source.program]) assert.equal(rows.filter(row=>row.yearLevel===year && row.semester===semester).reduce((sum,row)=>sum+row.units,0),total);
    for (const row of rows) for (const code of row.prerequisites.split(',').map(code=>code.trim()).filter(Boolean)) assert.ok(rows.some(subject=>subject.code===code),row.code+' missing '+code);
  }
  assert.equal(catalog.subjects.find(row=>row.code==='CS 108').units,2);
  assert.equal(catalog.subjects.find(row=>row.code==='CS 114').units,1);
  assert.equal(catalog.subjects.find(row=>row.code==='IT 115').units,6);
});

test('catalog import is atomic, role restricted, repeatable, and preserves program-specific descriptions',t=>{
  const store=openStore(':memory:');t.after(()=>store.close());
  assert.throws(()=>store.importCurriculum(catalog,head),/Registrar/);
  const malformed=structuredClone(catalog);
  malformed.subjects[malformed.subjects.length-1].prerequisites='DOES NOT EXIST';
  assert.throws(()=>store.importCurriculum(malformed,registrar),/prerequisite/i);
  assert.equal(store.list(registrar).curriculum.length,0);
  assert.equal(store.importCurriculum(catalog,registrar).inserted,100);
  const before=store.list(registrar);
  assert.equal(store.importCurriculum(catalog,registrar).inserted,0);
  assert.deepEqual(store.list(registrar),before);
  assert.deepEqual(before.curriculum.filter(row=>row.code==='COMP 106').map(row=>row.title).sort(),['Application Development and Emerging Technologies','Applications Development and Emerging Technologies']);
  assert.equal(before.curriculum.filter(row=>row.semester===3).length,3);
});

test('printed year-standing requirements use passed units from this curriculum and block server assignment',t=>{
  const store=openStore(':memory:');t.after(()=>store.close());
  store.importCurriculum(catalog,registrar);
  store.createTerm({year:2026,semester:2},registrar);
  const student=store.addStudent({...person,semester:2},registrar);
  const linear=catalog.subjects.find(row=>row.code==='CS 301');
  store.addSection({...linear,...meeting},registrar);
  assert.throws(()=>store.assignSubjects(student.id,['CS 301'],registrar),/standing|40/);
  assert.ok(store.evaluation(student.id,registrar).curriculum.find(row=>row.code==='CS 301').blockedReasons.some(reason=>reason.includes('40 passed')));
  const passed=catalog.subjects.filter(row=>row.program===person.program && row.yearLevel===1).map(row=>({code:row.code,grade:2}));
  store.recordResults(student.id,passed,registrar);
  assert.equal(store.evaluation(student.id,registrar).curriculum.find(row=>row.code==='CS 301').eligible,true);
  assert.deepEqual(store.assignSubjects(student.id,['CS 301'],registrar).subjects,['CS 301']);
});

test('historical code/title collisions remain visible but cannot be offered as another curriculum subject',t=>{
  const store=openStore(':memory:');t.after(()=>store.close());
  const old=store.addSection({...meeting,code:'CS 201',title:'Legacy Data Structures'},registrar);
  const student=store.addStudent({...person,level:'3rd year'},registrar);
  store.importCurriculum(catalog,registrar);
  assert.equal(store.list(registrar).sections.find(row=>row.id===old.id).title,'Legacy Data Structures');
  assert.equal(store.list(registrar).sections.find(row=>row.id===old.id).catalogMatch,false);
  assert.equal(store.evaluation(student.id,registrar).curriculum.find(row=>row.code==='CS 201').title,'CS Elective: Intelligent Systems');
  assert.throws(()=>store.offerPlan(student.id,[old.id],registrar),/historical|curriculum/i);
  const current=store.addSection({...catalog.subjects.find(row=>row.code==='CS 201'),...meeting,section:'B',day:'Tuesday'},registrar);
  assert.equal(store.list(registrar).sections.find(row=>row.id===current.id).title,'CS Elective: Intelligent Systems');
  assert.equal(store.offerPlan(student.id,[current.id],registrar).status,'pending');
  assert.equal(store.studentView(student.id).classes[0].title,'CS Elective: Intelligent Systems');
});

test('a legacy completion with a conflicting title prevents automatic remapping and leaves the catalog unchanged',t=>{
  const store=openStore(':memory:');t.after(()=>store.close());
  const student=store.addStudent(person,registrar);
  store.addSection({...meeting,code:'CS 201',title:'Legacy Data Structures'},registrar);
  store.completeSubject(student.id,'CS 201',registrar);
  assert.throws(()=>store.importCurriculum(catalog,registrar),/academic credits|different title/);
  assert.equal(store.list(registrar).curriculum.length,0);
  assert.deepEqual(store.list(registrar).completed.map(row=>row.code),['CS 201']);
});

test('sections inherit curriculum prerequisites and cannot add or clear requirements through section creation',t=>{
  const store=openStore(':memory:');t.after(()=>store.close());
  store.importCurriculum(catalog,registrar);
  const subject=catalog.subjects.find(row=>row.code==='COMP 103');
  const {prerequisites,...input}=subject;
  const section=store.addSection({...input,...meeting},registrar);
  assert.equal(store.list(registrar).sections.find(row=>row.id===section.id).prerequisites,'COMP 102');
  for (const override of ['', 'COMP 101', 'COMP 101, COMP 102']) assert.throws(()=>store.addSection({...input,...meeting,section:'B',day:'Tuesday',prerequisites:override},registrar),/curriculum/i);
  assert.equal(store.list(registrar).sections.length,1);
  assert.equal(store.list(registrar).curriculum.find(row=>row.code==='COMP 103').prerequisites,'COMP 102');
});
