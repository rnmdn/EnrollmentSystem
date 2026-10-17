import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { hash } from 'bcryptjs';
import { openStore } from './db.js';
import { startServer } from './http.js';
import { plpCurriculum2022 } from '../curriculum/plp-2022.js';
import {practiceRooms,practiceProfessor,retakeProfessor,practiceClassRoom} from './practice-resources.js';

const registrar = {role:'registrar',id:'registrar'};
const program = 'BS Information Technology';
export const practicePasswords = {registrar:'PracticeRegistrar2026!',head:'PracticeHead2026!',student:'PracticeStudent2026!'};

// This entry point only opens the separate expanded practice database.
export async function seedBlockPractice(store) {
  const initial=store.list(registrar);
  if (initial.students.length) {
    if (initial.students.length<480 || initial.blocks.length<16 || initial.sections.length<103 || !initial.students.some(row=>row.email==='example.regular@example.test')) throw new Error('Expanded practice database is incomplete. Inspect it before retrying; existing records were not changed.');
    return {seeded:false,students:initial.students.length};
  }
  store.importCurriculum(plpCurriculum2022,registrar);
  if (store.publicTerm().id!=='2026-1') throw new Error('Expanded practice requires the 2026 Semester 1 term.');
  const [registrarHash,headHash,studentHash]=await Promise.all(Object.values(practicePasswords).map(value=>hash(value,12)));
  store.setStaffPassword('registrar',registrarHash);
  store.setStaffPassword('department_head',headHash);
  const curriculum=plpCurriculum2022.subjects.filter(row=>row.program===program);
  const blocks=[];
  for (let year=1;year<=4;year++) for (const group of ['A','B','C','D']) {
    const block=store.createBlock({program,groupCode:group,cohortYear:2027-year,capacity:40},registrar);
    const term=store.createBlockTerm({blockId:block.id,yearLevel:year,source:plpCurriculum2022.version},registrar);
    blocks.push({year,group,block,term});
  }
  const people=blocks.flatMap(block=>Array.from({length:30},(_,index)=>({...block,position:index+1})));
  // Stable, easy-to-find accounts for the regular and irregular walkthroughs.
  const regular=people.find(row=>row.year===1 && row.group==='A' && row.position===1);
  const irregular=people.find(row=>row.year===1 && row.group==='A' && row.position===25);
  const ordered=[regular,irregular,...people.filter(row=>row!==regular && row!==irregular)];
  for (const row of ordered) {
    const type=row.position<=24?'regular':row.position<=28?'back_subject':row.position===29?'transferee':'returning';
    const email=row===regular?'example.regular@example.test':row===irregular?'example.irregular@example.test':`example.${row.year}${row.group.toLowerCase()}.${row.position}@example.test`;
    const student=store.addStudent({first:'Example',last:`${row.year}${row.group} Learner ${String(row.position).padStart(2,'0')}`,birth:`01/01/${2008-row.year+1}`,gender:'Unspecified',address:'Fictional practice address',phone:'00000000000',email,program,level:['1st year','2nd year','3rd year','4th year'][row.year-1],admitted:`07/01/${2027-row.year}`,semester:1,status:'Active',studentType:type},registrar);
    const failed=type==='back_subject'?['COMP 102','COMP 103','IT 104','IT 111'][row.year-1]:null;
    const blocked=new Set(failed?[failed]:[]);
    // A failed prerequisite must not leave impossible passed dependent credits.
    let changed=true;
    while(changed) {changed=false;for(const subject of curriculum) if(!blocked.has(subject.code) && subject.prerequisites.split(',').some(code=>blocked.has(code.trim()))) {blocked.add(subject.code);changed=true;}}
    const prior=curriculum.filter(subject=>subject.yearLevel<row.year || subject.code===failed);
    const results=prior.map(subject=>subject.code===failed?{code:subject.code,grade:'5.00'}:blocked.has(subject.code)?{code:subject.code,remark:'not_taken'}:{code:subject.code,grade:'2.00'});
    if(results.length) store.recordResults(student.id,results,registrar);
    store.setStudentPassword(student.id,studentHash);
    store.assignHomeBlock(student.id,{blockId:row.block.id},registrar);
  }
  const time=hour=>String(hour).padStart(2,'0')+':00';
  for(const room of practiceRooms) store.addResource({kind:'room',name:room,capacity:40},registrar);
  for(const row of blocks) {
    const subjects=curriculum.filter(subject=>subject.yearLevel===row.year && subject.semester===1);
    for(const [index,subject] of subjects.entries()) {
      const room=practiceClassRoom(row.year,subject.code),instructor=practiceProfessor(row.year,index);
      if(row.group==='A') store.addResource({kind:'professor',name:instructor},registrar);
      store.addBlockClass(row.term.id,{code:subject.code,day:['Monday','Tuesday','Wednesday','Thursday'][row.group.charCodeAt(0)-65],start:time(8+index),end:time(9+index),room,instructor,capacity:40},registrar);
    }
  }
  for(const [index,code] of ['COMP 103','IT 104','IT 111'].entries()) {
    const subject=curriculum.find(row=>row.code===code),room=`Lab ${index+1}`,instructor=retakeProfessor(index);
    store.addResource({kind:'professor',name:instructor},registrar);
    store.addSection({...subject,section:'Retake',day:'Friday',start:time(8+index),end:time(9+index),room,instructor,capacity:40},registrar);
  }
  return {seeded:true,students:480};
}

if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const databasePath=resolve('data/practice-blocks.sqlite');
  const store=openStore(databasePath);
  try {
    const result=await seedBlockPractice(store);
    const server=startServer(3004,databasePath,{store,practice:true});
    server.on('listening',()=>console.log(`Expanded practice: http://127.0.0.1:3004 — ${result.students} fictional students; ${result.seeded?'seeded':'existing progress retained'}.`));
  } catch(error) {store.close();console.error(error);process.exitCode=1;}
}
