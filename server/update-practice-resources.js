import {DatabaseSync} from 'node:sqlite';
import {resolve} from 'node:path';
import {backupDatabase} from './backup.js';
import {practiceRooms,practiceProfessor,retakeProfessor,practiceClassRoom} from './practice-resources.js';

// No path argument: this utility cannot target the main or original practice DB.
const path=resolve('data/practice-blocks.sqlite');
await backupDatabase(path,resolve(`data/backups/practice-resources-${Date.now()}.sqlite`));
const db=new DatabaseSync(path);
db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
try {
  for(const room of practiceRooms) db.prepare("INSERT OR IGNORE INTO resources(kind,name,capacity) VALUES('room',?,40)").run(room);
  const sections=db.prepare(`SELECT s.id,s.room,s.instructor,sub.code FROM sections s JOIN subjects sub ON sub.id=s.subject_id
    WHERE (s.instructor LIKE 'Example Professor %' OR s.instructor LIKE 'Example Retake Professor %')
    AND NOT EXISTS(SELECT 1 FROM plan_sections ps JOIN enrollment_plans p ON p.id=ps.plan_id WHERE ps.section_id=s.id AND p.status IN ('pending','accepted','confirmed'))`).all();
  let changed=0;
  for(const section of sections) {
    const match=/^Example Professor ([1-4])\.([1-8])$/.exec(section.instructor);
    const retake=/^Example Retake Professor ([1-3])$/.exec(section.instructor);
    if(!match && !retake) continue;
    const instructor=match?practiceProfessor(Number(match[1]),Number(match[2])-1):retakeProfessor(Number(retake[1])-1);
    const room=match?practiceClassRoom(Number(match[1]),section.code):`Lab ${retake[1]}`;
    db.prepare("INSERT OR IGNORE INTO resources(kind,name) VALUES('professor',?)").run(instructor);
    db.prepare('UPDATE sections SET room=?,instructor=? WHERE id=?').run(room,instructor,section.id);
    db.prepare("INSERT INTO audit_log(actor_label,action,entity,entity_id) VALUES('registrar:practice','update_practice_resources','section',?)").run(String(section.id));
    changed++;
  }
  // Check all active and historical terms before committing any schedule edits.
  const conflicts=db.prepare(`SELECT a.public_id,b.public_id FROM sections a JOIN sections b ON a.id<b.id AND a.term_id=b.term_id
    AND a.day=b.day AND a.start<b.end AND b.start<a.end AND (lower(trim(a.room))=lower(trim(b.room)) OR lower(trim(a.instructor))=lower(trim(b.instructor)))
    AND (a.start_date IS NULL OR b.start_date IS NULL OR (a.start_date<=b.end_date AND b.start_date<=a.end_date))`).all();
  if(conflicts.length) throw new Error('Resource changes introduce a schedule conflict; rolled back.');
  db.exec('COMMIT');
  console.log(`Practice resources updated: ${practiceRooms.length} requested rooms; ${changed} unpublished classes. Published schedules preserved.`);
} catch(error) {db.exec('ROLLBACK');throw error;} finally {db.close();}
