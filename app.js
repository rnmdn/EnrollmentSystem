import $ from 'jquery';
import '@fontsource-variable/outfit';
import '@fontsource-variable/newsreader';
import '@phosphor-icons/web/regular';
import 'jquery-ui-dist/jquery-ui.css';
import { migrateLegacyStudentNumbers } from './student-numbers.js';
window.jQuery = window.$ = $;
await import('jquery-ui-dist/jquery-ui.js');

const STORE_KEY = 'registrar-workspace-v1';
const seed = {
  students: [
    { id: '26-00001', first: 'Maya', last: 'Santos', email: 'maya.santos@example.test', program: 'BS Computer Science', level: '2nd year', admitted: '08/12/2025', status: 'Active' },
    { id: '26-00002', first: 'Ethan', last: 'Reyes', email: 'ethan.reyes@example.test', program: 'BS Information Technology', level: '1st year', admitted: '08/04/2026', status: 'Active' },
    { id: '26-00003', first: 'Aisha', last: 'Cruz', email: 'aisha.cruz@example.test', program: 'BS Computer Science', level: '3rd year', admitted: '08/11/2024', status: 'Active' },
    { id: '26-00004', first: 'Noah', last: 'Lim', email: 'noah.lim@example.test', program: 'BS Business Administration', level: '2nd year', admitted: '08/12/2025', status: 'Inactive' }
  ],
  sections: [
    { id: 'SEC-001', code: 'CS 201', title: 'Data Structures', section: 'A', instructor: 'Dr. R. Navarro', day: 'Monday', start: '09:00', end: '10:30', room: 'Lab 204', capacity: 30 },
    { id: 'SEC-002', code: 'CS 215', title: 'Database Systems', section: 'B', instructor: 'Prof. L. Tan', day: 'Tuesday', start: '13:00', end: '14:30', room: 'Room 312', capacity: 28 },
    { id: 'SEC-003', code: 'IT 110', title: 'Web Fundamentals', section: 'A', instructor: 'Prof. M. Yu', day: 'Wednesday', start: '10:00', end: '11:30', room: 'Lab 105', capacity: 32 },
    { id: 'SEC-004', code: 'BUS 203', title: 'Business Analytics', section: 'A', instructor: 'Dr. A. Dela Cruz', day: 'Friday', start: '08:00', end: '09:30', room: 'Room 207', capacity: 35 }
  ],
  enrollments: [
    { studentId: '26-00001', sectionId: 'SEC-001' },
    { studentId: '26-00001', sectionId: 'SEC-002' },
    { studentId: '26-00002', sectionId: 'SEC-003' },
    { studentId: '26-00003', sectionId: 'SEC-001' }
  ]
};

let data = load();
let page = 'overview';
let query = '';
let filter = 'All';
let selectedStudentId = data.students[0]?.id || '';
let notice = '';
let noticeType = '';
let ready = false;
let startupError = '';

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY));
    if (saved && Array.isArray(saved.students) && Array.isArray(saved.sections) && Array.isArray(saved.enrollments)) {
      if (migrateLegacyStudentNumbers(saved)) localStorage.setItem(STORE_KEY, JSON.stringify(saved));
      return saved;
    }
  } catch { /* Ignore damaged local prototype data. */ }
  return structuredClone(seed);
}
async function api(path, method = 'GET', payload) {
  const response = await fetch(`/api${path}`, { method, headers: { 'content-type': 'application/json', 'x-registrar-request': '1' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}
async function refreshData() {
  data = await api('/data');
  if (!data.students.some(student => student.id === selectedStudentId)) selectedStudentId = data.students[0]?.id || '';
}
async function bootstrap() {
  try {
    let current = await api('/data');
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && current.students.length === 0 && current.sections.length === 0) {
      try {
        await api('/import', 'POST', load());
        localStorage.removeItem(STORE_KEY);
        current = await api('/data');
      } catch (error) {
        notice = `Browser records were kept but could not be imported: ${error.message}`;
        noticeType = 'error';
      }
    }
    data = current;
    if (!data.students.some(student => student.id === selectedStudentId)) selectedStudentId = data.students[0]?.id || '';
    startupError = '';
  } catch (error) { data = { students: [], sections: [], enrollments: [] }; startupError = error.message; }
  ready = true;
  render();
}
function esc(value) { return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function fullName(student) { return `${student.first} ${student.last}`; }
function studentById(id) { return data.students.find(student => student.id === id); }
function sectionById(id) { return data.sections.find(section => section.id === id); }
function count(sectionId) { return data.enrollments.filter(item => item.sectionId === sectionId).length; }
function enrolled(studentId) { return data.enrollments.filter(item => item.studentId === studentId).map(item => sectionById(item.sectionId)).filter(Boolean); }
function formatTime(time) { const [hour, minute] = time.split(':').map(Number); return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`; }
function timeRange(section) { return `${formatTime(section.start)}–${formatTime(section.end)}`; }
function sectionLabel(section) { return `${section.code} · ${section.title} · ${section.section}`; }
function termLabel() { return data.term?.label || 'the active term'; }
function enrollmentChart() {
  const sections = [...data.sections].sort((a, b) => count(b.id) / b.capacity - count(a.id) / a.capacity).slice(0, 8);
  const capacityTotal = data.sections.reduce((sum, section) => sum + section.capacity, 0);
  const occupied = data.enrollments.length;
  const rate = capacityTotal ? Math.round(occupied / capacityTotal * 100) : 0;
  const chartWidth = 800, left = 180, plotWidth = 510, top = 38, rowHeight = 44;
  const chartHeight = top + sections.length * rowHeight + 38;
  const ticks = [0, 25, 50, 75, 100];
  const grid = ticks.map(tick => `<line x1="${left + tick / 100 * plotWidth}" y1="${top - 12}" x2="${left + tick / 100 * plotWidth}" y2="${chartHeight - 28}" class="chart-grid-line"/><text x="${left + tick / 100 * plotWidth}" y="17" text-anchor="middle" class="chart-tick">${tick}%</text>`).join('');
  const bars = sections.map((section, index) => {
    const y = top + index * rowHeight;
    const used = count(section.id);
    const percent = Math.round(used / section.capacity * 100);
    return `<g><title>${esc(section.code)} section ${esc(section.section)}: ${used} of ${section.capacity} seats filled (${percent}%)</title><text x="0" y="${y + 17}" class="chart-section">${esc(section.code)} · ${esc(section.section)}</text><rect x="${left}" y="${y}" width="${plotWidth}" height="22" class="chart-capacity"/><rect x="${left}" y="${y}" width="${used / section.capacity * plotWidth}" height="22" class="chart-occupied"/><text x="${left + plotWidth + 14}" y="${y + 17}" class="chart-value">${used} / ${section.capacity}</text></g>`;
  }).join('');
  return `<section class="panel analytics-panel" aria-label="Enrollment analytics"><div class="panel-head"><div><h2>Enrollment analytics</h2><p class="panel-note">Seat utilization across sections · ${esc(termLabel())}</p></div><button class="text-button" data-page="sections" type="button">View sections <i class="ph ph-arrow-right" aria-hidden="true"></i></button></div><div class="analytics-summary"><div><strong>${rate}%</strong><span>Overall seat utilization</span></div><div><strong>${occupied}</strong><span>Filled seats</span></div><div><strong>${capacityTotal - occupied}</strong><span>Available seats</span></div></div>${sections.length ? `<div class="analytics-chart-wrap"><svg class="analytics-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Seat utilization by section; occupied seats shown in dark green and available seats in pale green">${grid}${bars}</svg></div><div class="chart-legend"><span><i class="occupied-key"></i> Filled</span><span><i class="capacity-key"></i> Available</span><small>Showing ${sections.length} of ${data.sections.length} sections, sorted by utilization</small></div>` : empty('No section data yet', 'Create a section to see enrollment analytics.')}</section>`;
}
function alertUser(message, type = 'success') {
  $('#status').text(message);
  if (type === 'error') {
    $('#main > .notice').remove();
    $('#main > .page-heading').after(`<div class="notice error" role="alert">${esc(message)}</div>`);
    return;
  }
  notice = message; noticeType = type; render();
}
function noticeHTML() { const html = notice ? `<div class="notice ${noticeType === 'error' ? 'error' : ''}" role="alert">${esc(notice)}</div>` : ''; notice = ''; return html; }
function heading(_context, title, subtitle, action = '') { return `<div class="page-heading"><div><h1>${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p></div>${action}</div>`; }
function empty(title, text) { return `<div class="empty"><strong>${esc(title)}</strong>${esc(text)}</div>`; }
function badge(label) { const className = label === 'Active' ? '' : label === 'Inactive' ? 'muted' : label === 'Full' ? 'warning' : 'blue'; return `<span class="badge ${className}">${esc(label)}</span>`; }
function capacity(section) { const used = count(section.id), pct = Math.min(100, Math.round(used / section.capacity * 100)); return `<div class="capacity"><div class="capacity-track"><div class="capacity-fill ${used >= section.capacity ? 'full' : ''}" style="width:${pct}%"></div></div><span>${used}/${section.capacity}</span></div>`; }
function rowStudent(student) { return `<tr><td data-label="Student"><strong>${esc(fullName(student))}</strong><small>${esc(student.email)}</small></td><td data-label="Student ID"><span class="id-code">${esc(student.id)}</span></td><td data-label="Program">${esc(student.program)}</td><td data-label="Year level">${esc(student.level)}</td><td data-label="Status">${badge(student.status)}</td><td data-label="Record"><button class="text-button" data-action="student-detail" data-id="${esc(student.id)}" type="button">View record <i class="ph ph-arrow-right" aria-hidden="true"></i></button></td></tr>`; }
function rowSection(section) { return `<tr><td data-label="Subject"><strong>${esc(section.code)} · ${esc(section.section)}</strong><small>${esc(section.title)}</small></td><td data-label="Instructor">${esc(section.instructor)}</td><td data-label="Meeting">${esc(section.day)}<small>${esc(timeRange(section))}</small></td><td data-label="Room">${esc(section.room)}</td><td data-label="Seats">${capacity(section)}</td><td data-label="Status">${badge(count(section.id) >= section.capacity ? 'Full' : 'Open')}</td></tr>`; }

function overview() {
  const active = data.students.filter(student => student.status === 'Active').length;
  const seats = data.sections.reduce((sum, section) => sum + section.capacity, 0);
  const occupied = data.enrollments.length;
  return heading('Workspace overview', 'The academic ledger.', `Student and section records for ${termLabel()}.`, `<button class="button primary" data-page="enroll" type="button"><i class="ph ph-plus" aria-hidden="true"></i> New enrollment</button>`) + noticeHTML() +
    `<div class="overview-grid" aria-label="Current term summary"><div class="metric lead-metric"><span class="label">Students on record</span><strong>${data.students.length}</strong><small>${active} active student${active === 1 ? '' : 's'}</small></div><div class="metric"><span class="label">Open sections</span><strong>${data.sections.filter(section => count(section.id) < section.capacity).length}</strong><small>of ${data.sections.length} scheduled</small></div><div class="metric"><span class="label">Enrollments</span><strong>${occupied}</strong><small>Current term allocations</small></div><div class="metric"><span class="label">Seats remaining</span><strong>${seats - occupied}</strong><small>Across all sections</small></div></div>` +
    enrollmentChart() +
    `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Recent student records</h2><p class="panel-note">Master records in the registry</p></div><button class="text-button" data-page="students" type="button">View all <i class="ph ph-arrow-right" aria-hidden="true"></i></button></div><div class="table-wrap"><table class="data-table"><thead><tr><th>Student</th><th>Student ID</th><th>Program</th><th>Status</th></tr></thead><tbody>${data.students.slice(-4).reverse().map(student => `<tr><td><strong>${esc(fullName(student))}</strong></td><td class="id-code">${esc(student.id)}</td><td>${esc(student.program)}</td><td>${badge(student.status)}</td></tr>`).join('')}</tbody></table></div></section><section class="panel action-panel"><div class="panel-head"><div><h2>At your desk</h2><p class="panel-note">Start a registry task</p></div></div><div class="quick-list"><button class="quick-action" data-page="student-new" type="button"><i class="ph ph-student" aria-hidden="true"></i><span><strong>Register a student</strong><small>Assign a permanent student number</small></span><i class="ph ph-arrow-right" aria-hidden="true"></i></button><button class="quick-action" data-page="section-new" type="button"><i class="ph ph-books" aria-hidden="true"></i><span><strong>Create a section</strong><small>Add a class to this term</small></span><i class="ph ph-arrow-right" aria-hidden="true"></i></button><button class="quick-action" data-page="enroll" type="button"><i class="ph ph-arrows-left-right" aria-hidden="true"></i><span><strong>Allocate a section</strong><small>Check seats and meeting times</small></span><i class="ph ph-arrow-right" aria-hidden="true"></i></button></div></section></div>`;
}

function students() {
  const list = data.students.filter(student => `${fullName(student)} ${student.id} ${student.program}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'All' || student.status === filter));
  return heading('Master records', 'Students', 'Find, review, and maintain permanent student records.', `<button class="button primary" data-page="student-new" type="button">+ Register student</button>`) + noticeHTML() +
    `<section class="panel"><div class="toolbar"><div class="toolbar-left"><input class="search" id="student-search" type="search" placeholder="Search name, ID, or program" aria-label="Search students" value="${esc(query)}"><select class="select" id="student-filter" aria-label="Filter students by status"><option ${filter === 'All' ? 'selected' : ''}>All</option><option ${filter === 'Active' ? 'selected' : ''}>Active</option><option ${filter === 'Inactive' ? 'selected' : ''}>Inactive</option></select></div><span class="panel-note">${list.length} student${list.length === 1 ? '' : 's'}</span></div>${list.length ? `<div class="table-wrap"><table class="data-table record-table"><thead><tr><th>Student</th><th>Student ID</th><th>Program</th><th>Year level</th><th>Status</th><th></th></tr></thead><tbody>${list.map(rowStudent).join('')}</tbody></table></div>` : empty('No records found', 'Try a different search or status filter.')}</section>`;
}

function studentForm(student = null) {
  const edit = Boolean(student);
  return heading('Master records / Students', edit ? 'Edit student record' : 'Register a student', edit ? 'Update this student’s master record.' : 'A permanent student ID will be generated when the record is saved.', `<button class="button" data-page="students" type="button">← Back to students</button>`) + noticeHTML() +
    `<section class="panel form-panel"><div class="panel-head"><div><h2>Student information</h2><p class="panel-note">Fields marked * are required.</p></div></div><form id="student-form" data-id="${esc(student?.id || '')}"><div class="form-grid"><div class="field"><label for="first">First name *</label><input id="first" name="first" value="${esc(student?.first || '')}" required maxlength="60" autocomplete="given-name"></div><div class="field"><label for="last">Last name *</label><input id="last" name="last" value="${esc(student?.last || '')}" required maxlength="60" autocomplete="family-name"></div><div class="field full"><label for="email">Email address *</label><input id="email" name="email" type="email" value="${esc(student?.email || '')}" required maxlength="120" autocomplete="email"></div><div class="field"><label for="program">Program *</label><select id="program" name="program" required><option value="">Choose a program</option>${['BS Computer Science','BS Information Technology','BS Business Administration','BS Accountancy','BA Communication'].map(program => `<option value="${esc(program)}" ${student?.program === program ? 'selected' : ''}>${esc(program)}</option>`).join('')}</select></div><div class="field"><label for="level">Year level *</label><select id="level" name="level" required>${['1st year','2nd year','3rd year','4th year'].map(level => `<option ${student?.level === level ? 'selected' : ''}>${level}</option>`).join('')}</select></div><div class="field"><label for="admitted">Admission date *</label><input id="admitted" name="admitted" placeholder="MM/DD/YYYY" value="${esc(student?.admitted || '')}" required><span class="field-help">Type a date or select it from the calendar.</span></div><div class="field"><label for="student-status">Status *</label><select id="student-status" name="status"><option ${student?.status !== 'Inactive' ? 'selected' : ''}>Active</option><option ${student?.status === 'Inactive' ? 'selected' : ''}>Inactive</option></select></div></div><div class="form-actions"><button class="button primary" type="submit">${edit ? 'Save changes' : 'Register student'}</button><button class="button" data-page="students" type="button">Cancel</button></div></form></section>`;
}

function studentDetail(student) {
  const classes = enrolled(student.id);
  return heading('Master records / Students', fullName(student), `${student.id} · ${student.program}`, `<div class="button-row"><button class="button" data-action="student-edit" data-id="${esc(student.id)}" type="button">Edit record</button><button class="button" data-page="students" type="button">← Back</button></div>`) + noticeHTML() +
    `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Student profile</h2><p class="panel-note">Permanent master record</p></div>${badge(student.status)}</div><div class="detail-row"><span>Student ID</span><span class="id-code">${esc(student.id)}</span></div><div class="detail-row"><span>Full name</span><span>${esc(fullName(student))}</span></div><div class="detail-row"><span>Email</span><span>${esc(student.email)}</span></div><div class="detail-row"><span>Program</span><span>${esc(student.program)}</span></div><div class="detail-row"><span>Year level</span><span>${esc(student.level)}</span></div><div class="detail-row"><span>Admission date</span><span>${esc(student.admitted)}</span></div></section><section class="panel"><div class="panel-head"><div><h2>Current enrollment</h2><p class="panel-note">${esc(termLabel())}</p></div></div>${classes.length ? `<div class="section-list">${classes.map(section => `<div class="section-item"><div><strong>${esc(section.code)} · ${esc(section.title)}</strong><small>${esc(section.day)} · ${esc(timeRange(section))}</small></div>${badge(section.section)}</div>`).join('')}</div>` : empty('No sections yet', 'Allocate this student to a section to see it here.')}<div style="margin-top:17px"><button class="button primary" data-page="enroll" data-student="${esc(student.id)}" type="button">+ Allocate section</button></div></section></div>`;
}

function sections() {
  const list = data.sections.filter(section => `${section.code} ${section.title} ${section.instructor} ${section.room}`.toLowerCase().includes(query.toLowerCase()));
  return heading('Course scheduling', 'Sections', `Class offerings for ${termLabel()}.`, `<button class="button primary" data-page="section-new" type="button">+ Create section</button>`) + noticeHTML() +
    `<section class="panel"><div class="toolbar"><input class="search" id="section-search" type="search" placeholder="Search subject, instructor, room" aria-label="Search sections" value="${esc(query)}"><span class="panel-note">${list.length} section${list.length === 1 ? '' : 's'}</span></div>${list.length ? `<div class="table-wrap"><table class="data-table record-table"><thead><tr><th>Subject / section</th><th>Instructor</th><th>Meeting time</th><th>Room</th><th>Seats</th><th>Status</th></tr></thead><tbody>${list.map(rowSection).join('')}</tbody></table></div>` : empty('No sections found', 'Try a different search or create a section.')}</section>`;
}

function sectionForm() {
  return heading('Course scheduling / Sections', 'Create a section', 'Add a class offering and set its meeting time and capacity.', `<button class="button" data-page="sections" type="button">← Back to sections</button>`) + noticeHTML() +
    `<section class="panel form-panel"><div class="panel-head"><div><h2>Section details</h2><p class="panel-note">One meeting day and time per section in this prototype.</p></div></div><form id="section-form"><div class="form-grid"><div class="field"><label for="code">Subject code *</label><input id="code" name="code" placeholder="e.g. CS 301" required maxlength="20"></div><div class="field"><label for="section">Section name *</label><input id="section" name="section" placeholder="e.g. A" required maxlength="15"></div><div class="field full"><label for="title">Subject title *</label><input id="title" name="title" placeholder="e.g. Software Engineering" required maxlength="100"></div><div class="field"><label for="instructor">Instructor *</label><input id="instructor" name="instructor" required maxlength="100"></div><div class="field"><label for="room">Room *</label><input id="room" name="room" required maxlength="40"></div><div class="field"><label for="day">Meeting day *</label><select id="day" name="day">${['Monday','Tuesday','Wednesday','Thursday','Friday'].map(day => `<option>${day}</option>`).join('')}</select></div><div class="field"><label for="capacity">Seat capacity *</label><input id="capacity" name="capacity" type="number" min="1" max="500" value="30" required></div><div class="field"><label for="start">Start time *</label><input id="start" name="start" type="time" value="09:00" required></div><div class="field"><label for="end">End time *</label><input id="end" name="end" type="time" value="10:30" required></div></div><div class="form-actions"><button class="button primary" type="submit">Create section</button><button class="button" data-page="sections" type="button">Cancel</button></div></form></section>`;
}

function enrollment() {
  const activeStudents = data.students.filter(student => student.status === 'Active');
  const chosen = studentById(selectedStudentId);
  const classes = chosen ? enrolled(chosen.id) : [];
  return heading('Student allocation', 'Enrollment', `Allocate a student to a section in ${termLabel()}.`, '') + noticeHTML() +
    `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>New section allocation</h2><p class="panel-note">Capacity and schedule conflicts are checked before saving.</p></div></div><form id="enroll-form"><div class="form-grid"><div class="field full"><label for="enroll-student">Student *</label><input id="enroll-student" name="student" placeholder="Start typing a name or student ID" value="${chosen ? esc(`${fullName(chosen)} (${chosen.id})`) : ''}" required autocomplete="off"><span class="field-help">Only active students can be enrolled.</span></div><div class="field full"><label for="enroll-section">Section *</label><select id="enroll-section" name="sectionId" required><option value="">Choose an available section</option>${data.sections.map(section => `<option value="${esc(section.id)}" ${count(section.id) >= section.capacity ? 'disabled' : ''}>${esc(section.code)} · ${esc(section.title)} · ${esc(section.section)} (${count(section.id)}/${section.capacity})</option>`).join('')}</select></div></div><div class="form-actions"><button class="button primary" type="submit">Allocate section</button></div></form></section><section class="panel"><div class="panel-head"><div><h2>Current sections</h2><p class="panel-note">${chosen ? esc(fullName(chosen)) : 'Select a student'}</p></div></div>${chosen ? (classes.length ? `<div class="section-list">${classes.map(section => `<div class="section-item"><div><strong>${esc(section.code)} · ${esc(section.section)}</strong><small>${esc(section.day)} · ${esc(timeRange(section))}</small></div><button class="text-button" data-action="drop" data-student="${esc(chosen.id)}" data-section="${esc(section.id)}" type="button">Remove</button></div>`).join('')}</div>` : empty('No sections allocated', 'Choose an open section to get started.')) : empty('Choose a student', 'Their current sections will appear here.')}</section></div>`;
}

function schedule() {
  const student = studentById(selectedStudentId);
  const classes = student ? enrolled(student.id) : [];
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday'];
  return heading('Timetable', 'Student schedule', `Review meeting times for ${termLabel()}.`, '') + noticeHTML() +
    `<section class="panel"><div class="toolbar"><div class="toolbar-left"><label class="sr-only" for="schedule-student">Student</label><select class="select" id="schedule-student"><option value="">Choose a student</option>${data.students.map(item => `<option value="${esc(item.id)}" ${selectedStudentId === item.id ? 'selected' : ''}>${esc(fullName(item))} · ${esc(item.id)}</option>`).join('')}</select></div><span class="panel-note">${classes.length} allocated section${classes.length === 1 ? '' : 's'}</span></div>${student ? `<div class="schedule-grid">${days.map(day => `<div class="day-column"><div class="day-title">${day}</div>${classes.filter(section => section.day === day).sort((a,b) => a.start.localeCompare(b.start)).map(section => `<div class="class-card"><span>${esc(timeRange(section))}</span><strong>${esc(section.code)} · ${esc(section.section)}</strong><small>${esc(section.title)}<br>${esc(section.room)}</small></div>`).join('')}</div>`).join('')}</div>` : empty('Select a student', 'Choose a student to see their timetable.')}</section><section class="panel" style="margin-top:18px"><div class="panel-head"><div><h2>Schedule list</h2><p class="panel-note">A compact view of each allocated class</p></div></div>${classes.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Subject</th><th>Section</th><th>Day</th><th>Time</th><th>Room</th><th>Instructor</th></tr></thead><tbody>${classes.map(section => `<tr><td><strong>${esc(section.code)}</strong><small>${esc(section.title)}</small></td><td>${esc(section.section)}</td><td>${esc(section.day)}</td><td>${esc(timeRange(section))}</td><td>${esc(section.room)}</td><td>${esc(section.instructor)}</td></tr>`).join('')}</tbody></table></div>` : empty('No classes scheduled', 'Allocate a section to this student to fill their timetable.')}</section>`;
}

function termsPage() {
  const nextYear = Number(data.term?.id?.slice(0, 4) || new Date().getFullYear()) + 1;
  return heading('Academic calendar', 'Academic terms', 'Choose the active term for sections and enrollment. Student IDs stay permanent.', '') + noticeHTML() +
    `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Term history</h2><p class="panel-note">Switching terms shows its sections and allocations.</p></div></div><div class="term-list">${data.terms.map(term => `<div class="term-item"><div><strong>${esc(term.label)}</strong><small>${term.sections} sections · ${term.enrollments} enrollments</small></div>${term.active ? badge('Active') : `<button class="button small" data-action="activate-term" data-id="${esc(term.id)}" type="button">Make active</button>`}</div>`).join('')}</div></section><section class="panel"><div class="panel-head"><div><h2>Create a term</h2><p class="panel-note">New terms start empty and become active.</p></div></div><form id="term-form"><div class="field"><label for="term-year">Academic year starts *</label><input id="term-year" name="year" type="number" min="2000" max="2099" value="${nextYear}" required></div><div class="field term-semester"><label for="term-semester">Term *</label><select id="term-semester" name="semester"><option value="1">Semester 1</option><option value="2">Semester 2</option><option value="3">Summer</option></select></div><div class="form-actions"><button class="button primary" type="submit">Create and activate</button></div></form></section></div>`;
}

function render() {
  if (!ready) { $('#main').html('<div class="empty">Opening registry…</div>'); return; }
  if (startupError) { $('#main').html(`<div class="page-heading"><div><h1>Registry unavailable</h1><p class="subtitle">Start the local server with npm run dev, then reload this page.</p></div></div><div class="notice error" role="alert">${esc(startupError)}</div>`); return; }
  let html;
  if (page === 'overview') html = overview();
  else if (page === 'students') html = students();
  else if (page === 'student-new') html = studentForm();
  else if (page.startsWith('student-edit:')) html = studentForm(studentById(page.split(':')[1]));
  else if (page.startsWith('student:')) html = studentDetail(studentById(page.split(':')[1]));
  else if (page === 'sections') html = sections();
  else if (page === 'section-new') html = sectionForm();
  else if (page === 'enroll') html = enrollment();
  else if (page === 'schedule') html = schedule();
  else html = termsPage();
  $('#main').html(html);
  $('#active-term-label').text(termLabel());
  $('.nav-link').removeClass('active').removeAttr('aria-current');
  const navPage = page.startsWith('student') ? 'students' : page.startsWith('section') ? 'sections' : page;
  $(`.nav-link[data-page="${navPage}"]`).addClass('active').attr('aria-current', 'page');
  if (page.startsWith('student-new') || page.startsWith('student-edit:')) $('#admitted').datepicker({ dateFormat: 'mm/dd/yy', changeMonth: true, changeYear: true, yearRange: '1990:+0', maxDate: 0 });
  if (page === 'enroll') $('#enroll-student').autocomplete({ minLength: 0, source: data.students.filter(student => student.status === 'Active').map(student => ({ label: `${fullName(student)} (${student.id})`, value: `${fullName(student)} (${student.id})`, id: student.id })), select: (_event, ui) => { selectedStudentId = ui.item.id; setTimeout(render, 0); } });
}

$(document).on('click', '[data-page]', function () {
  page = this.dataset.page;
  if (this.dataset.student) selectedStudentId = this.dataset.student;
  query = ''; filter = 'All'; render(); $('#main').trigger('focus');
});
$(document).on('click', '[data-action="student-detail"]', function () { page = `student:${this.dataset.id}`; render(); $('#main').trigger('focus'); });
$(document).on('click', '[data-action="student-edit"]', function () { page = `student-edit:${this.dataset.id}`; render(); $('#main').trigger('focus'); });
$(document).on('input', '#student-search, #section-search', function () {
  const position = this.selectionStart; query = this.value; render(); const next = document.getElementById(this.id); next.focus(); next.setSelectionRange(position, position);
});
$(document).on('change', '#student-filter', function () { filter = this.value; render(); });
$(document).on('change', '#schedule-student', function () { selectedStudentId = this.value; render(); });
$(document).on('submit', '#term-form', async function (event) {
  event.preventDefault();
  try { await api('/terms', 'POST', Object.fromEntries(new FormData(this))); await refreshData(); alertUser(`${termLabel()} is now active.`); }
  catch (error) { alertUser(error.message, 'error'); }
});
$(document).on('click', '[data-action="activate-term"]', async function () {
  try { await api(`/terms/${encodeURIComponent(this.dataset.id)}/activate`, 'POST'); await refreshData(); alertUser(`${termLabel()} is now active.`); }
  catch (error) { alertUser(error.message, 'error'); }
});

$(document).on('submit', '#student-form', async function (event) {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(this));
  const id = this.dataset.id;
  const email = fields.email.trim().toLowerCase();
  try {
    const parsed = $.datepicker.parseDate('mm/dd/yy', fields.admitted);
    if (parsed > new Date()) throw new Error('future date');
  } catch { alertUser('Enter a valid admission date that is not in the future.', 'error'); return; }
  try {
    const record = await api(id ? `/students/${encodeURIComponent(id)}` : '/students', id ? 'PUT' : 'POST', { ...fields, email });
    await refreshData();
    selectedStudentId = record.id;
    page = `student:${record.id}`;
    alertUser(id ? 'Student record updated.' : `Student registered with number ${record.id}.`);
  } catch (error) { alertUser(error.message, 'error'); }
});
$(document).on('submit', '#section-form', async function (event) {
  event.preventDefault(); const fields = Object.fromEntries(new FormData(this));
  if (fields.start >= fields.end) { alertUser('End time must be later than start time.', 'error'); return; }
  try { await api('/sections', 'POST', fields); await refreshData(); page = 'sections'; alertUser('Section created. It is ready for student allocation.'); }
  catch (error) { alertUser(error.message, 'error'); }
});
$(document).on('submit', '#enroll-form', async function (event) {
  event.preventDefault(); const fields = Object.fromEntries(new FormData(this));
  const student = data.students.find(item => `${fullName(item)} (${item.id})` === fields.student.trim() || item.id === fields.student.trim());
  const section = sectionById(fields.sectionId);
  if (!student || student.status !== 'Active') { alertUser('Choose an active student from the suggestions.', 'error'); return; }
  selectedStudentId = student.id;
  if (!section) { alertUser('Choose a section.', 'error'); return; }
  try { await api('/enrollments', 'POST', { studentId: student.id, sectionId: section.id }); await refreshData(); alertUser(`${fullName(student)} was allocated to ${section.code} · ${section.section}.`); }
  catch (error) { alertUser(error.message, 'error'); }
});
$(document).on('click', '[data-action="drop"]', function () {
  const studentId = this.dataset.student, sectionId = this.dataset.section;
  const student = studentById(studentId), section = sectionById(sectionId);
  $('#confirm-dialog').html(`Remove <strong>${esc(fullName(student))}</strong> from <strong>${esc(section.code)} · ${esc(section.section)}</strong>?`).dialog({ modal: true, resizable: false, width: Math.min(420, window.innerWidth - 30), buttons: [
    { text: 'Cancel', click() { $(this).dialog('close'); } },
    { text: 'Remove allocation', async click() { try { await api('/enrollments', 'DELETE', { studentId, sectionId }); await refreshData(); $(this).dialog('close'); alertUser('Section allocation removed.'); } catch (error) { $(this).dialog('close'); alertUser(error.message, 'error'); } } }
  ] });
});

render();
bootstrap();
