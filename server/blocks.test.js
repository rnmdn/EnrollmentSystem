import test from 'node:test';
import assert from 'node:assert/strict';
import {openStore} from './db.js';
import {seedBlockPractice} from './practice-blocks.js';

const registrar={role:'registrar',id:'registrar'},head={role:'department_head',id:'department_head'};
const program='BS Information Technology';
const person={first:'Example',last:'Block learner',birth:'01/01/2008',gender:'Unspecified',address:'Example address',phone:'0000000',email:'block@example.test',program,level:'1st year',admitted:'07/01/2026',semester:1,studentType:'regular'};
function fixture() {
  const store=openStore(':memory:');
  const student=store.addStudent(person,registrar);
  const a=store.createBlock({program,groupCode:'A',cohortYear:2026,capacity:2},registrar);
  const b=store.createBlock({program,groupCode:'B',cohortYear:2026,capacity:2},registrar);
  store.addCurriculum({program,code:'EX1',title:'Example foundations',yearLevel:1,semester:1,units:3},registrar);
  store.addCurriculum({program,code:'EX2',title:'Example concepts',yearLevel:1,semester:1,units:3},registrar);
  for(const group of ['A','B']) {
    store.addResource({kind:'room',name:'Room '+group,capacity:2},registrar);
    store.addResource({kind:'professor',name:'Professor '+group},registrar);
  }
  const term=store.createBlockTerm({blockId:a.id,yearLevel:1},registrar);
  const meeting={day:'Monday',start:'08:00',end:'09:00',room:'Room A',instructor:'Professor A',capacity:2};
  store.assignHomeBlock(student.id,{blockId:a.id},registrar);
  return {store,student,a,b,term,meeting};
}
test('home block persists through all four year levels and Registrar transfers are recorded',()=>{
  const {store,student,a,b}=fixture();
  try {
    for(let year=2;year<=4;year++) {
      store.createTerm({year:2025+year,semester:1},registrar);
      store.updateStudent(student.id,{...person,level:['','1st year','2nd year','3rd year','4th year'][year]},registrar);
      const home=store.studentView(student.id).homeBlock;
      assert.equal(home.id,a.id);assert.equal(home.label,`BSIT ${year}A`);
      assert.equal(store.list().students[0].id,student.id);
    }
    assert.throws(()=>store.assignHomeBlock(student.id,{blockId:b.id,reason:'Transfer'},head),/Only the Registrar/);
    assert.throws(()=>store.assignHomeBlock(student.id,{blockId:b.id},registrar),/reason/);
    store.assignHomeBlock(student.id,{blockId:b.id,reason:'Verified transfer request'},registrar);
    const history=store.list(registrar).blockTransfers[0];
    assert.equal(history.fromBlockId,a.id);assert.equal(history.toBlockId,b.id);assert.equal(history.actor,'registrar:registrar');
    assert.equal(store.studentView(student.id).homeBlock.label,'BSIT 4B');
    assert.deepEqual(store.list(head).blocks,[]);
  } finally {store.close();}
});
test('block assignment explains pending review and inactive status, then permits a reviewed active registration',()=>{
  const {store,b}=fixture();
  try {
    const student=store.registerStudent({...person,first:'Pending',email:'pending-block@example.test',consent:true});
    assert.throws(()=>store.assignHomeBlock(student.id,{blockId:b.id},registrar),/awaiting Registrar review/);
    assert.equal(store.studentView(student.id).homeBlock,null);
    store.reviewStudent(student.id,registrar);
    store.updateStudent(student.id,{...person,first:'Pending',email:'pending-block@example.test',status:'Inactive'},registrar);
    assert.throws(()=>store.assignHomeBlock(student.id,{blockId:b.id},registrar),/student is inactive/);
    store.updateStudent(student.id,{...person,first:'Pending',email:'pending-block@example.test',status:'Active'},registrar);
    assert.equal(store.assignHomeBlock(student.id,{blockId:b.id},registrar).id,b.id);
  } finally {store.close();}
});
test('complete block offers are atomic, reject mixed classes and lock transfers after publication',()=>{
  const {store,student,a,b,term,meeting}=fixture();
  try {
    const first=store.addBlockClass(term.id,{...meeting,code:'EX1'},registrar);
    assert.throws(()=>store.offerBlockPlan(student.id,term.id,registrar),/EX2/);
    assert.equal(store.list().plans.length,0);
    assert.throws(()=>store.addBlockClass(term.id,{...meeting,code:'EX2',room:'Room B',instructor:'Professor B'},registrar),/overlaps/);
    const second=store.addBlockClass(term.id,{...meeting,code:'EX2',start:'09:00',end:'10:00'},registrar);
    assert.throws(()=>store.offerPlan(student.id,[first.id],registrar),/home block/);
    const offer=store.offerBlockPlan(student.id,term.id,registrar);
    assert.equal(offer.blockLabel,'BSIT 1A');assert.deepEqual(offer.sectionIds.sort(),[first.id,second.id].sort());
    assert.throws(()=>store.assignHomeBlock(student.id,{blockId:b.id,reason:'Transfer'},registrar),/published/);
    store.respondPlan(student.id,'accepted',offer.revision,{role:'student',id:student.id});
    store.confirmPlan(student.id,registrar);
    assert.equal(store.studentView(student.id).homeBlock.id,a.id);
    assert.ok(store.studentView(student.id).classes.every(row=>row.section==='BSIT 1A'));
    const third=store.addStudent({...person,first:'Third',email:'third@example.test'},registrar);
    store.assignHomeBlock(third.id,{blockId:a.id},registrar);
    const fourth=store.addStudent({...person,first:'Fourth',email:'fourth@example.test'},registrar);
    assert.throws(()=>store.assignHomeBlock(fourth.id,{blockId:a.id},registrar),/no available/);
    const foreign=store.createBlock({program:'BS Computer Science',groupCode:'A',cohortYear:2026,capacity:10},registrar);
    assert.throws(()=>store.assignHomeBlock(fourth.id,{blockId:foreign.id},registrar),/program/);
  } finally {store.close();}
});
test('expanded practice has 30 learners in each 1A–4D block, usable regular and irregular workflows, and preserves progress',async()=>{
  const store=openStore(':memory:');
  try {
    assert.equal((await seedBlockPractice(store)).students,480);
    const data=store.list(registrar);
    assert.equal(data.blocks.length,16);assert.ok(data.blocks.every(row=>row.members===30));
    assert.equal(data.blockTerms.length,16);assert.equal(data.sections.length,103);
    const rooms=data.resources.filter(row=>row.kind==='room').map(row=>row.name);
    assert.equal(rooms.length,14);
    for(const name of ['601','602','603','604','605','606','607','608','609','610','Lab 1','Lab 2','Lab 3','Lab 4']) assert.ok(rooms.includes(name));
    assert.ok(data.sections.every(row=>rooms.includes(row.room) && row.instructor.startsWith('Prof. ')));
    assert.equal(data.students.filter(row=>row.studentType==='regular').length,384);
    assert.equal(data.students.filter(row=>row.studentType==='back_subject').length,64);
    assert.equal(data.students.filter(row=>row.studentType==='transferee').length,16);
    assert.equal(data.students.filter(row=>row.studentType==='returning').length,16);
    assert.ok(data.students.every(row=>row.email.endsWith('@example.test') && row.homeBlock));
    // All regular year levels must be enrollable with the supplied curriculum and standing rules.
    for(let year=1;year<=4;year++) {
      const student=data.students.find(row=>row.homeBlock.label===`BSIT ${year}A` && row.studentType==='regular');
      const term=data.blockTerms.find(row=>row.blockId===student.homeBlock.id);
      assert.equal(store.offerBlockPlan(student.id,term.id,registrar).status,'pending');
    }
    const irregular=data.students.find(row=>row.email==='example.irregular@example.test');
    const guest=data.sections.find(row=>row.code==='COMP 102' && row.blockLabel==='BSIT 1B');
    assert.throws(()=>store.assignSubjects(irregular.id,['COMP 102'],head),/must decide/);
    store.chooseBackSubjects(irregular.id,['COMP 102'],{role:'student',id:irregular.id});
    store.assignSubjects(irregular.id,['COMP 102'],head);
    const offer=store.offerPlan(irregular.id,[guest.id],registrar);
    assert.equal(offer.status,'pending');assert.equal(store.studentView(irregular.id).homeBlock.label,'BSIT 1A');
    assert.equal(store.studentView(irregular.id).classes[0].section,'BSIT 1B');
    const before=store.list(registrar);
    assert.equal((await seedBlockPractice(store)).seeded,false);
    assert.deepEqual(store.list(registrar),before);
  } finally {store.close();}
});

