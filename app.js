import $ from 'jquery';
import '@fontsource-variable/outfit';
import '@fontsource-variable/newsreader';
import '@phosphor-icons/web/regular';
import 'jquery-ui-dist/jquery-ui.css';
import './styles.css';
import './ui-refresh.css';
import './plp.css';
import { programs as plpPrograms } from './institution.js';
import { evaluateGrade } from './grade.js';
import { parseResultCSV } from './csv.js';
window.jQuery = window.$ = $;
await import('jquery-ui-dist/jquery-ui.js');
let data = { students: [], sections: [], enrollments: [], curriculum: [], plans: [], terms: [], completed: [] };
let page = 'overview', query = '', filter = 'All', selectedStudentId = '', notice = '', noticeType = '', startupError = '';
let publicConfig = {}, publicConfigError = '';
const evaluations = new Map(), resultPreviews = new Map();
let recoveryResult = null;
let selectedBlockId=0,blockTab=0;
let ready = false, auth = { configured: false, authenticated: false };
let draftStudentId = '', draftSections = [], assignmentStudentId = '', assignmentCodes = [];
let curriculumFilter = { program: '', yearLevel: '', semester: '' }, reportFilter = { term: '', program: '', status: '' }, viewRevision = 0;
const staffViews = ['overview','students','student-new','student','student-edit','sections','section-new','enroll','schedule','terms','curriculum','assignments','reports','audit','staff','evaluation','resources','practice','access','blocks'];
const formDrafts = new Map();
let formContext = '', routeReady = false, routeInitial = true;
const sectionDrafts = new Map(), subjectDrafts = new Map();
const planStates = { unassigned: 'Not assigned', draft: 'Subject assignment draft', pending: 'Awaiting student response', accepted: 'Accepted · awaiting confirmation', declined: 'Declined · revision needed', confirmed: 'Enrollment confirmed' };
const stateLabel = value => planStates[value] || value;
const semesterLabel = value => Number(value) === 3 ? 'Summer' : String(value);
const prerequisiteLabel = entry => [entry.prerequisites, entry.minimumYear ? ({2:'2nd',3:'3rd',4:'4th'}[entry.minimumYear] + ' year standing · ' + entry.minimumPassedUnits + ' passed units') : ''].filter(Boolean).join('; ') || 'None';
const roleLabel = value => ({ registrar: 'Registrar', department_head: 'Department Head', student: 'Student' })[String(value || '').split(':')[0]] || 'Staff';
function readRoute() {
  const params = new URLSearchParams(location.search), view = params.get('view'), id = params.get('student') || '';
  selectedBlockId=Number(params.get('block')) || 0;
  selectedStudentId = /^\d{2}-\d{5}$/.test(id) ? id : '';
  page = staffViews.includes(view) ? view : 'overview';
  if (['student','student-edit'].includes(page)) page = selectedStudentId ? page + ':' + selectedStudentId : 'students';
  query = typeof history.state?.staffQuery === 'string' ? history.state.staffQuery : '';
  filter = ['All','Active','Inactive'].includes(params.get('status')) ? params.get('status') : 'All';
  curriculumFilter = { program: params.get('curriculumProgram') || '', yearLevel: ['1','2','3','4'].includes(params.get('year')) ? params.get('year') : '', semester: ['1','2','3'].includes(params.get('semester')) ? params.get('semester') : '' };
  reportFilter = { term: params.get('term') || '', program: params.get('reportProgram') || '', status: Object.hasOwn(planStates, params.get('planStatus')) ? params.get('planStatus') : '' };
}
function syncRoute(replace = false) {
  if (!auth.authenticated || !routeReady) return;
  const [view, id] = page.split(':'), params = new URLSearchParams({ view });
  if (page==='blocks' && selectedBlockId) params.set('block',selectedBlockId);
  if (id || selectedStudentId) params.set('student', id || selectedStudentId);
  if (filter !== 'All') params.set('status', filter);
  for (const [key,value] of Object.entries({ curriculumProgram: curriculumFilter.program, year: curriculumFilter.yearLevel, semester: curriculumFilter.semester, term: reportFilter.term, reportProgram: reportFilter.program, planStatus: reportFilter.status })) if (value) params.set(key,value);
  const url = location.pathname + '?' + params;
  if (url !== location.pathname + location.search || query !== (history.state?.staffQuery || '')) history[replace || routeInitial ? 'replaceState' : 'pushState']({ staffQuery: query }, '', url);
  routeInitial = false;
}
function formValues(form) {
  return [...form.elements].filter(field => field.id && !field.readOnly && field.id !== 'identity-verified' && !['password','submit','button','file'].includes(field.type)).map(field => [field.id, ['checkbox','radio'].includes(field.type) ? field.checked : field.value]);
}
const formKey = form => formContext + ':' + form.id;
function restoreForms() {
  formContext = page + ':' + (['enroll','assignments','evaluation','blocks'].includes(page) ? selectedStudentId+':'+(page==='blocks'?selectedBlockId:'') : '') + ':' + (data.term?.id || '');
  $('#main form').not('#auth-form, #staff-form, #curriculum-filter, #report-form').each(function () {
    const key = formKey(this), saved = formDrafts.get(key);
    if (saved) for (const [id,value] of saved.values) { const field = document.getElementById(id); if (field && field.form === this) { if (typeof value === 'boolean') field.checked = value; else field.value = value; } }
    else formDrafts.set(key, { baseline: JSON.stringify(formValues(this)), values: formValues(this), dirty: false });
  });
}
function clearFormDraft(form) { formDrafts.delete(formKey(form)); }
function hasUnsavedChanges() { return [...resultPreviews.values()].some(rows => rows.length) || [...formDrafts.values()].some(draft => draft.dirty) || [...sectionDrafts.values()].some(sections => sections.length) || [...subjectDrafts].some(([id,codes]) => JSON.stringify(codes) !== JSON.stringify(planFor(id)?.subjects || [])) || draftSections.length > 0 || (assignmentStudentId && JSON.stringify(assignmentCodes) !== JSON.stringify(planFor(assignmentStudentId)?.subjects || [])); }
window.addEventListener('beforeunload', event => { if (auth.authenticated && hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; } });
window.addEventListener('popstate', () => { readRoute(); render(); });
$(document).on('input change', '#main form input, #main form select, #main form textarea', function () {
  const saved = formDrafts.get(formKey(this.form));
  if (saved) { saved.values = formValues(this.form); saved.dirty = JSON.stringify(saved.values) !== saved.baseline; }
});
readRoute();
const types = { regular: 'Regular', back_subject: 'Back subject', transferee: 'Transferee', returning: 'Returning', academic_recovery: 'Academic recovery', accessible_learning: 'Accessible learning' };
const isRegistrar = () => auth.role === 'registrar';
const isSpecial = student => student && (student.studentType || 'regular') !== 'regular';
const assignedByHead = plan => String(plan?.assignedBy || '').split(':')[0] === 'department_head';
const activeSemester = () => Number(data.term?.semester || data.term?.id?.split('-')[1] || 1);
const canAssign = student => student && (isRegistrar() ? !isSpecial(student) : isSpecial(student));
const planFor = id => (data.plans || []).find(p => p.studentId === id && (!p.termId || p.termId === data.term?.id));
const programs = () => [...new Set([...plpPrograms.map(program => program.name), ...data.students.map(s => s.program), ...(data.curriculum || []).map(s => s.program)])].sort();
const options = (values, selected = '') => values.map(v => `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(v)}</option>`).join('');
const inputField = (label, id, extra = '') => {
  let name = id;
  extra = extra.replace(/(^|\s)name\s*=\s*(?:"([^"]*)"|'([^']*)')/gi, (_attribute, space, doubleQuoted, singleQuoted) => {
    name = doubleQuoted ?? singleQuoted;
    return space;
  });
  return `<div class="field"><label for="${esc(id)}">${label}</label><input id="${esc(id)}" name="${esc(name)}" ${extra}></div>`;
};
const selectField = (label, name, values, selected = '', all = '') => `<div class="field"><label for="${name}">${label}</label><select id="${name}" name="${name}">${all ? `<option value="">${all}</option>` : ''}${values.map(v => `<option value="${esc(v)}" ${String(v) === String(selected) ? 'selected' : ''}>${esc(stateLabel(v))}</option>`).join('')}</select></div>`;
function table(headers, rows) { return `<div class="table-wrap" role="region" tabindex="0" aria-label="Staff records table; scroll horizontally for all columns"><table class="data-table"><thead><tr>${headers.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`; }
function planSummary(plan) { return plan ? `<p class="plan-status">${badge(stateLabel(plan.status))} <span>Revision ${esc(plan.revision)} · Assigned by ${esc(roleLabel(plan.assignedBy))}</span></p><p class="panel-note">${esc((plan.subjects || []).join(', ') || 'No subjects assigned')}</p>` : '<p class="panel-note">No subject assignment or offer for this term.</p>'; }
async function api(path, method = 'GET', payload) {
  const response = await fetch(`/api${path}`, { method, headers: { 'content-type': 'application/json', 'x-registrar-request': '1' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || `Request failed (${response.status}).`);
  return result;
}
async function refreshData() {
  const termId = data.term?.id;
  data = await api('/data');
  evaluations.clear();
  if (termId !== data.term?.id) { resultPreviews.clear(); draftStudentId = ''; draftSections = []; assignmentStudentId = ''; assignmentCodes = []; sectionDrafts.clear(); subjectDrafts.clear(); formDrafts.clear(); }
  if (!data.students.some(student => student.id === selectedStudentId)) selectedStudentId = data.students[0]?.id || '';
}
async function bootstrap() {
  try {
    auth = await api('/auth/status');
    try { publicConfig = await api('/public/config'); publicConfigError = ''; } catch (error) { publicConfig = {}; publicConfigError = error.message; }
    if (!auth.authenticated) { ready = true; render(); return; }
    if (auth.role === 'student') { location.replace('/student.html'); return; }
    data = await api('/data');
    if (!data.students.some(student => student.id === selectedStudentId)) selectedStudentId = data.students[0]?.id || '';
    startupError = '';
  } catch (error) { data = { students: [], sections: [], enrollments: [] }; startupError = error.message; }
  ready = true;
  routeReady = true;
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
function sectionLabel(section) { return `${section.code} · ${section.title} · ${section.blockLabel || section.section}`; }
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
    return `<g><title>${esc(section.code)} section ${esc(section.blockLabel || section.section)}: ${used} of ${section.capacity} seats reserved (${percent}%)</title><text x="0" y="${y + 17}" class="chart-section">${esc(section.code)} · ${esc(section.blockLabel || section.section)}</text><rect x="${left}" y="${y}" width="${plotWidth}" height="22" class="chart-capacity"/><rect x="${left}" y="${y}" width="${used / section.capacity * plotWidth}" height="22" class="chart-occupied"/><text x="${left + plotWidth + 14}" y="${y + 17}" class="chart-value">${used} / ${section.capacity}</text></g>`;
  }).join('');
  return `<section class="panel analytics-panel" aria-label="Enrollment analytics"><div class="panel-head"><div><h2>Enrollment analytics</h2><p class="panel-note">Seat utilization across sections · ${esc(termLabel())}</p></div><button class="text-button" data-page="sections" type="button">View sections <i class="ph ph-arrow-right" aria-hidden="true"></i></button></div><div class="analytics-summary"><div><strong>${rate}%</strong><span>Overall seat utilization</span></div><div><strong>${occupied}</strong><span>Reserved seats</span></div><div><strong>${capacityTotal - occupied}</strong><span>Available seats</span></div></div>${sections.length ? `<div class="analytics-chart-wrap"><svg class="analytics-chart" viewBox="0 0 ${chartWidth} ${chartHeight}" role="img" aria-label="Seat utilization by section; occupied seats shown in dark green and available seats in pale green">${grid}${bars}</svg></div><div class="chart-legend"><span><i class="occupied-key"></i> Reserved</span><span><i class="capacity-key"></i> Available</span><small>Showing ${sections.length} of ${data.sections.length} sections, sorted by utilization</small></div>` : empty('No section data yet', 'Create a section to see enrollment analytics.')}</section>`;
}
function alertUser(message, type = 'success') {
  $('#status').text(message);
  if (type === 'error') {
    $('#main > .notice').remove();
    $('#main').prepend(`<div class="notice error" role="alert">${esc(message)}</div>`);
    return;
  }
  notice = message; noticeType = type; render();
}
function noticeHTML() { const html = notice ? `<div class="notice ${noticeType === 'error' ? 'error' : ''}" role="alert">${esc(notice)}</div>` : ''; notice = ''; return html; }
function heading(_context, title, subtitle, action = '') { return `<div class="page-heading"><div><h1>${esc(title)}</h1><p class="subtitle">${esc(subtitle)}</p></div>${action}</div>`; }
function empty(title, text) { return `<div class="empty"><strong>${esc(title)}</strong>${esc(text)}</div>`; }
function badge(label) { const className = label === 'Active' ? '' : label === 'Inactive' ? 'muted' : label === 'Full' ? 'warning' : 'blue'; return `<span class="badge ${className}">${esc(label)}</span>`; }
function capacity(section) { const used = count(section.id), pct = Math.min(100, Math.round(used / section.capacity * 100)); return `<div class="capacity"><div class="capacity-track"><div class="capacity-fill ${used >= section.capacity ? 'full' : ''}" style="width:${pct}%"></div></div><span>${used}/${section.capacity}</span></div>`; }
function rowStudent(student) { return `<tr><td data-label="Student"><strong>${esc(fullName(student))}</strong><small>${esc(student.email)}</small></td><td data-label="Student ID"><span class="id-code">${esc(student.id)}</span>${student.homeBlock ? `<small>${esc(student.homeBlock.label)}</small>` : ''}</td><td data-label="Program">${esc(student.program)}</td><td data-label="Year level">${esc(student.level)}</td><td data-label="Status">${badge(student.reviewedAt ? student.status : 'Awaiting review')}</td><td data-label="Record"><button class="text-button" data-action="student-detail" data-id="${esc(student.id)}" type="button">View record <i class="ph ph-arrow-right" aria-hidden="true"></i></button></td></tr>`; }
function rowSection(section) { return `<tr><td data-label="Subject"><strong>${esc(section.code)} · ${esc(section.blockLabel || section.section)}</strong><small>${esc(section.title)}</small></td><td data-label="Instructor">${esc(section.instructor)}</td><td data-label="Meeting">${esc(section.day)}<small>${esc(timeRange(section))}</small></td><td data-label="Room">${esc(section.room)}</td><td data-label="Seats">${capacity(section)}</td><td data-label="Status">${badge(count(section.id) >= section.capacity ? 'Full' : 'Open')}</td></tr>`; }

function taskQueue() {
  const reviews = isRegistrar() ? data.students.filter(student => !student.reviewedAt) : [];
  const accepted = isRegistrar() ? (data.plans || []).filter(plan => (!plan.termId || plan.termId === data.term?.id) && plan.status === 'accepted' && studentById(plan.studentId)) : [];
  const special = !isRegistrar() ? data.students.filter(student => student.status === 'Active' && student.reviewedAt && canAssign(student) && (!planFor(student.id) || ['draft','declined'].includes(planFor(student.id).status))) : [];
  const preparation = isRegistrar() ? data.students.filter(student => {
    const plan = planFor(student.id);
    return student.status === 'Active' && student.reviewedAt && (canAssign(student) ? !plan || ['draft','declined'].includes(plan.status) : plan?.status === 'draft' && plan.subjects?.length);
  }) : [];
  const rows = reviews.map(student => '<tr><td><strong>' + esc(fullName(student)) + '</strong><small>' + esc(student.id) + '</small></td><td>Registration awaiting review</td><td><button class="button small" data-action="student-detail" data-id="' + esc(student.id) + '" type="button">Review registration</button></td></tr>');
  for (const plan of accepted) rows.push('<tr><td><strong>' + esc(fullName(studentById(plan.studentId))) + '</strong><small>' + esc(plan.studentId) + '</small></td><td>Accepted · awaiting confirmation</td><td><button class="button small" data-page="enroll" data-student="' + esc(plan.studentId) + '" type="button">Review and confirm schedule</button></td></tr>');
  for (const student of special) rows.push('<tr><td>' + esc(fullName(student)) + '<small>' + esc(student.id) + '</small></td><td>Subject assignment needed</td><td><button class="button small" data-page="assignments" data-student="' + esc(student.id) + '" type="button">Review subjects</button></td></tr>');
  for (const student of preparation) rows.push('<tr><td>' + esc(fullName(student)) + '<small>' + esc(student.id) + '</small></td><td>Subjects or schedule need preparation</td><td><button class="button small" data-page="enroll" data-student="' + esc(student.id) + '" type="button">Prepare schedule</button></td></tr>');
  return '<section class="panel task-queue" aria-label="Enrollment tasks"><div class="panel-head"><div><h2>Needs your attention</h2><p class="panel-note">' + rows.length + ' tasks in the records available to your role</p></div></div>' + (rows.length ? table(['Student','Task','Action'], rows) : empty('All caught up', 'No tasks are awaiting your action.')) + '</section>';
}
function overview() {
  if (!isRegistrar()) return heading('', 'Enrollment tasks', 'Review special cases in the records available to your role.') + noticeHTML() + taskQueue();
  const active = data.students.filter(student => student.status === 'Active').length;
  const seats = data.sections.reduce((sum, section) => sum + section.capacity, 0);
  const occupied = data.enrollments.length;
  return heading('Workspace overview', 'Enrollment tasks', `Student and section records for ${termLabel()}.`, `<button class="button primary" data-page="enroll" type="button"><i class="ph ph-plus" aria-hidden="true"></i> New enrollment</button>`) + noticeHTML() + taskQueue() +
    `<div class="overview-grid" aria-label="Current term summary"><div class="metric lead-metric"><span class="label">Students on record</span><strong>${data.students.length}</strong><small>${active} active student${active === 1 ? '' : 's'}</small></div><div class="metric"><span class="label">Open sections</span><strong>${data.sections.filter(section => count(section.id) < section.capacity).length}</strong><small>of ${data.sections.length} scheduled</small></div><div class="metric"><span class="label">Enrollments</span><strong>${occupied}</strong><small>Reserved or confirmed seats</small></div><div class="metric"><span class="label">Seats remaining</span><strong>${seats - occupied}</strong><small>Across all sections</small></div></div>` +
    enrollmentChart() +
    `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Recent student records</h2><p class="panel-note">Master records in the registry</p></div><button class="text-button" data-page="students" type="button">View all <i class="ph ph-arrow-right" aria-hidden="true"></i></button></div>${data.students.length ? `<div class="table-wrap" role="region" tabindex="0" aria-label="Staff records table; scroll horizontally for all columns"><table class="data-table"><thead><tr><th>Student</th><th>Student ID</th><th>Program</th><th>Status</th></tr></thead><tbody>${data.students.slice(-4).reverse().map(student => `<tr><td><strong>${esc(fullName(student))}</strong></td><td class="id-code">${esc(student.id)}</td><td>${esc(student.program)}</td><td>${badge(student.status)}</td></tr>`).join('')}</tbody></table></div>` : empty('No student records yet', 'Register a student to start the master registry.')}</section><section class="panel action-panel"><div class="panel-head"><div><h2>At your desk</h2><p class="panel-note">Start a registry task</p></div></div><div class="quick-list"><button class="quick-action" data-page="student-new" type="button"><i class="ph ph-student" aria-hidden="true"></i><span><strong>Register a student</strong><small>Assign a permanent student number</small></span><i class="ph ph-arrow-right" aria-hidden="true"></i></button><button class="quick-action" data-page="section-new" type="button"><i class="ph ph-books" aria-hidden="true"></i><span><strong>Create a section</strong><small>Add a class to this term</small></span><i class="ph ph-arrow-right" aria-hidden="true"></i></button><button class="quick-action" data-page="enroll" type="button"><i class="ph ph-arrows-left-right" aria-hidden="true"></i><span><strong>Allocate a section</strong><small>Check seats and meeting times</small></span><i class="ph ph-arrow-right" aria-hidden="true"></i></button></div></section></div>`;
}

function students() {
  const list = data.students.filter(student => `${fullName(student)} ${student.id} ${student.program}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'All' || student.status === filter));
  return heading('Master records', 'Students', 'Find, review, and maintain permanent student records.', `<button class="button primary" data-page="student-new" type="button">+ Register student</button>`) + noticeHTML() +
    `<section class="panel"><div class="toolbar"><div class="toolbar-left"><input class="search" id="student-search" type="search" placeholder="Search name, ID, or program" aria-label="Search students" value="${esc(query)}"><select class="select" id="student-filter" aria-label="Filter students by status"><option ${filter === 'All' ? 'selected' : ''}>All</option><option ${filter === 'Active' ? 'selected' : ''}>Active</option><option ${filter === 'Inactive' ? 'selected' : ''}>Inactive</option></select></div><span class="panel-note">${list.length} student${list.length === 1 ? '' : 's'}</span></div>${list.length ? `<div class="table-wrap" role="region" tabindex="0" aria-label="Staff records table; scroll horizontally for all columns"><table class="data-table record-table"><thead><tr><th>Student</th><th>Student ID</th><th>Program</th><th>Year level</th><th>Status</th><th>Record</th></tr></thead><tbody>${list.map(rowStudent).join('')}</tbody></table></div>` : data.students.length ? empty('No records found', 'Try a different search or status filter.') : empty('No student records yet', 'Register a student to build the registry.')}</section>`;
}

function studentForm(student = null) {
  const edit = Boolean(student);
  return heading('Master records / Students', edit ? 'Edit student record' : 'Register a student', edit ? 'Update this student’s master record.' : 'A permanent student ID will be generated when the record is saved.', `<button class="button" data-page="students" type="button">← Back to students</button>`) + noticeHTML() +
    `<section class="panel form-panel"><div class="panel-head"><div><h2>Student information</h2><p class="panel-note">Fields marked * are required. Existing records are checked before a new ID is issued.</p></div></div><form id="student-form" data-id="${esc(student?.id || '')}"><div class="form-grid">
    <div class="field"><label for="first">First name *</label><input id="first" name="first" value="${esc(student?.first || '')}" required maxlength="60" autocomplete="given-name"></div>
    <div class="field"><label for="last">Last name *</label><input id="last" name="last" value="${esc(student?.last || '')}" required maxlength="60" autocomplete="family-name"></div>
    <div class="field"><label for="birth">Birth date *</label><input id="birth" name="birth" placeholder="MM/DD/YYYY" value="${esc(student?.birth || '')}" required></div>
    <div class="field"><label for="gender">Gender *</label><select id="gender" name="gender" required><option value="">Choose</option>${['Female','Male','Nonbinary','Prefer not to say'].map(gender => `<option ${student?.gender === gender ? 'selected' : ''}>${gender}</option>`).join('')}</select></div>
    <div class="field full"><label for="address">Address *</label><input id="address" name="address" value="${esc(student?.address || '')}" required maxlength="240" autocomplete="street-address"></div>
    <div class="field"><label for="phone">Contact number *</label><input id="phone" name="phone" type="tel" value="${esc(student?.phone || '')}" required maxlength="40" autocomplete="tel"></div>
    <div class="field"><label for="email">Email address *</label><input id="email" name="email" type="email" value="${esc(student?.email || '')}" required maxlength="120" autocomplete="email"></div>
    <div class="field"><label for="program">Program / course *</label><select id="program" name="program" required><option value="">Choose a program</option>${programs().map(program => `<option value="${esc(program)}" ${student?.program === program ? 'selected' : ''}>${esc(program)}</option>`).join('')}</select></div>
    <div class="field"><label for="level">Year level *</label><select id="level" name="level" required>${['1st year','2nd year','3rd year','4th year'].map(level => `<option ${student?.level === level ? 'selected' : ''}>${level}</option>`).join('')}</select></div>
    <div class="field"><label for="admitted">Admission date *</label><input id="admitted" name="admitted" placeholder="MM/DD/YYYY" value="${esc(student?.admitted || '')}" required></div>
    <div class="field"><label for="student-type">Student type · registrar confirmation *</label><select id="student-type" name="studentType">${Object.entries(types).map(([value, label]) => `<option value="${value}" ${value === (student?.studentType || 'regular') ? 'selected' : ''}>${label}</option>`).join('')}</select></div><div class="field"><label for="semester">Semester *</label><select id="semester" name="semester">${options([1, 2], student?.semester || 1)}</select></div><div class="field"><label for="student-status">Status *</label><select id="student-status" name="status"><option ${student?.status !== 'Inactive' ? 'selected' : ''}>Active</option><option ${student?.status === 'Inactive' ? 'selected' : ''}>Inactive</option></select></div></div><div class="form-actions"><button class="button primary" type="submit">${edit ? 'Save changes' : 'Check and register student'}</button><button class="button" data-page="students" type="button">Cancel</button></div></form></section>`;
}

function studentDetail(student) {
  const classes = enrolled(student.id);
  return heading('Master records / Students', fullName(student), `${student.id} · ${student.program}`, `<div class="button-row"><button class="button" data-action="student-edit" data-id="${esc(student.id)}" type="button">Edit record</button><button class="button" data-page="students" type="button">← Back</button></div>`) + noticeHTML() +
    `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Student profile</h2><p class="panel-note">Permanent master record</p></div>${badge(student.status)}</div><div class="detail-row"><span>Student ID</span><span class="id-code">${esc(student.id)}</span></div><div class="detail-row"><span>Full name</span><span>${esc(fullName(student))}</span></div><div class="detail-row"><span>Email</span><span>${esc(student.email)}</span></div><div class="detail-row"><span>Program</span><span>${esc(student.program)}</span></div><div class="detail-row"><span>Year level</span><span>${esc(student.level)}</span></div><div class="detail-row"><span>Admission date</span><span>${esc(student.admitted)}</span></div></section><section class="panel"><div class="panel-head"><div><h2>Current enrollment</h2><p class="panel-note">${esc(termLabel())}</p></div></div>${classes.length ? `<div class="section-list">${classes.map(section => `<div class="section-item"><div><strong>${esc(section.code)} · ${esc(section.title)}</strong><small>${esc(section.day)} · ${esc(timeRange(section))}</small></div>${badge(section.blockLabel || section.section)}</div>`).join('')}</div>` : empty('No sections yet', 'Allocate this student to a section to see it here.')}<div style="margin-top:17px"><button class="button primary" data-page="enroll" data-student="${esc(student.id)}" type="button">+ Allocate section</button></div></section></div>`;
}

function sections() {
  const list = data.sections.filter(section => `${section.code} ${section.title} ${section.instructor} ${section.room}`.toLowerCase().includes(query.toLowerCase()));
  return heading('Course scheduling', 'Sections', `Class offerings for ${termLabel()}.`, `<button class="button primary" data-page="section-new" type="button">+ Create section</button>`) + noticeHTML() +
    `<section class="panel"><div class="toolbar"><input class="search" id="section-search" type="search" placeholder="Search subject, instructor, room" aria-label="Search sections" value="${esc(query)}"><span class="panel-note">${list.length} section${list.length === 1 ? '' : 's'}</span></div>${list.length ? `<div class="table-wrap" role="region" tabindex="0" aria-label="Staff records table; scroll horizontally for all columns"><table class="data-table record-table"><thead><tr><th>Subject / section</th><th>Instructor</th><th>Meeting time</th><th>Room</th><th>Seats</th><th>Status</th></tr></thead><tbody>${list.map(rowSection).join('')}</tbody></table></div>` : data.sections.length ? empty('No sections found', 'Try a different search or create a section.') : empty('No sections yet', 'Create a section for the active term to begin allocation.')}</section>`;
}

function sectionForm() {
  return heading('Course scheduling / Sections', 'Create a section', 'Add a class offering and set its meeting time and capacity.', `<button class="button" data-page="sections" type="button">← Back to sections</button>`) + noticeHTML() +
    `<section class="panel form-panel"><div class="panel-head"><div><h2>Section details</h2><p class="panel-note">Set the meeting day, time, room and seat capacity.</p></div></div><form id="section-form"><div class="form-grid"><div class="field"><label for="code">Subject code *</label><input id="code" name="code" placeholder="e.g. CS 301" required maxlength="20"></div><div class="field"><label for="section">Section name *</label><input id="section" name="section" placeholder="e.g. A" required maxlength="15"></div><div class="field full"><label for="title">Subject title *</label><input id="title" name="title" placeholder="e.g. Software Engineering" required maxlength="100"></div><div class="field"><label for="instructor">Instructor *</label><input id="instructor" name="instructor" required maxlength="100"></div><div class="field"><label for="room">Room *</label><input id="room" name="room" required maxlength="40"></div><div class="field"><label for="day">Meeting day *</label><select id="day" name="day">${['Monday','Tuesday','Wednesday','Thursday','Friday'].map(day => `<option>${day}</option>`).join('')}</select></div><div class="field"><label for="capacity">Seat capacity *</label><input id="capacity" name="capacity" type="number" min="1" max="500" value="30" required></div><div class="field"><label for="start">Start time *</label><input id="start" name="start" type="time" value="09:00" required></div><div class="field"><label for="end">End time *</label><input id="end" name="end" type="time" value="10:30" required></div></div><div class="form-actions"><button class="button primary" type="submit">Create section</button><button class="button" data-page="sections" type="button">Cancel</button></div></form></section>`;
}

function updateSectionCurriculum() {
  const codeInput=document.getElementById('code');
  if (!codeInput || !document.getElementById('section-form')) return;
  const code=codeInput.value.trim().toUpperCase();
  const entries=(data.curriculum || []).filter(subject=>subject.code===code);
  const valid=entries.length>0;
  codeInput.setCustomValidity(code && !valid ? 'Choose a subject from the curriculum. Add new subjects in Curriculum first.' : '');
  $('#title').val(valid ? entries[0].title : '');
  const labels=[...new Set(entries.map(prerequisiteLabel))];
  const description=valid ? labels.join(' / ') : '';
  $('#prerequisites').val(description);
  $('#section-prerequisite-status').text(valid ? 'Curriculum prerequisites: '+description : code ? 'Subject not found in the curriculum.' : '');
}
$(document).on('input change', '#section-form #code',updateSectionCurriculum);
function enrollment() {
  const student = studentById(selectedStudentId), plan = planFor(student?.id);
  const locked = plan && !['draft','declined'].includes(plan.status);
  if (locked) {
    const classes = (plan.sectionIds?.length ? plan.sectionIds.map(sectionById).filter(Boolean) : enrolled(student.id));
    const explanation = { pending: 'The published schedule is reserved while the student decides.', accepted: 'The student accepted this schedule. Confirm enrollment to finalize it.', confirmed: 'This enrollment is confirmed.' }[plan.status] || 'This published schedule is read only.';
    return heading('', 'Schedule offers', 'Published schedule for ' + termLabel() + '.') + noticeHTML() + studentPicker('offer-student', student) +
      '<section class="panel"><div class="panel-head"><div><h2>' + esc(fullName(student)) + '</h2><p class="panel-note">' + esc(student.id) + ' · ' + esc(termLabel()) + '</p></div></div>' + planSummary(plan) + '<p class="workflow-explanation">' + explanation + '</p><h3>Published schedule · read only</h3>' + scheduleTimetable(classes) + table(['Subject / section','Instructor','Meeting','Room','Reserved seats','Availability'], classes.map(rowSection)) + (plan.status === 'accepted' && isRegistrar() ? '<div class="form-actions"><button class="button primary" data-action="confirm-accepted" data-id="' + esc(student.id) + '" type="button">Confirm accepted enrollment</button></div>' : '') + '</section>';
  }
  if (student && !isSpecial(student)) return regularBlockOffer(student);
  const blocked = locked || student?.status !== 'Active' || !student?.reviewedAt || (isSpecial(student) && (!assignedByHead(plan) || !plan.subjects?.length || plan.status === 'declined'));
  const available = student ? data.sections.filter(section => section.catalogMatch !== false && eligibleSubjects(student).some(c => c.code === section.code) && (!isSpecial(student) || plan?.subjects?.includes(section.code))) : [];
  const draft = draftStudentId === selectedStudentId ? draftSections.map(sectionById).filter(Boolean) : [];
  return heading('', 'Schedule offers', `Prepare sections for ${termLabel()}, then publish an offer for the student to accept.`) + noticeHTML() +
    studentPicker('offer-student', student) + (student ? `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>${esc(fullName(student))}</h2><p class="panel-note">${esc(student.id)} · ${esc(types[student.studentType] || 'Regular')} · Semester ${esc(student.semester || 1)}</p></div></div>${planSummary(plan)}${plan?.status === 'declined' ? '<div class="notice">The student declined the previous offer and its seats were released. Prepare a revised offer below.</div>' : ''}${!student.reviewedAt ? '<div class="notice">Review the registration before offering sections.</div>' : ''}${isSpecial(student) && (!assignedByHead(plan) || plan?.status === 'declined') ? '<div class="notice">A current Department Head subject assignment is required. A declined special offer must be reassigned by the Department Head.</div>' : ''}${plan?.status === 'accepted' ? `<div class="notice">The student accepted this offer. Confirm enrollment to finalize the reserved schedule.</div><button class="button primary" data-action="confirm-accepted" data-id="${esc(student.id)}" type="button">Confirm accepted enrollment</button>` : ''}<form id="enroll-form"><div class="field"><label for="enroll-section">Available section *</label><select id="enroll-section" name="sectionId" required ${blocked ? 'disabled' : ''}><option value="">Choose a section</option>${available.map(section => `<option value="${esc(section.id)}" ${count(section.id) >= section.capacity ? 'disabled' : ''}>${esc(sectionLabel(section))} · ${esc(section.day)} ${esc(timeRange(section))} · ${count(section.id)}/${section.capacity}</option>`).join('')}</select><span class="field-help">Only eligible curriculum subjects appear. Add verified curriculum entries first if this list is empty.</span></div><div class="form-actions"><button class="button" type="submit" ${blocked ? 'disabled' : ''}>Add section to offer</button></div></form></section><section class="panel"><div class="panel-head"><div><h2>Offer to student</h2><p class="panel-note">${isSpecial(student) ? 'Include exactly one section for every Department Head assigned subject.' : 'Review the complete schedule before publishing.'}</p></div></div>${draft.length ? `<div class="section-list">${draft.map(section => `<div class="section-item"><div><strong>${esc(sectionLabel(section))}</strong><small>${esc(section.day)} · ${esc(timeRange(section))} · ${esc(section.room)} · ${esc(section.instructor)}</small></div><button class="text-button" data-action="remove-draft" data-id="${esc(section.id)}" type="button" aria-label="Remove ${esc(section.code)} from offer">Remove</button></div>`).join('')}</div><div class="form-actions"><button class="button primary" data-action="confirm-draft" type="button" ${blocked ? 'disabled' : ''}>Review and publish offer</button></div>` : empty('No sections selected', 'Add sections to prepare the student’s offer.')}${plan?.sectionIds?.length ? `<h3>Previous declined offer · seats released</h3><ul>${plan.sectionIds.map(sectionById).filter(Boolean).map(s => `<li>${esc(sectionLabel(s))} · ${esc(s.day)} ${esc(timeRange(s))}</li>`).join('')}</ul>` : ''}</section></div>` : empty('Choose a student', 'Search for a student to prepare or confirm their schedule offer.'));
}

function scheduleTimetable(classes) {
  const days = [...new Set(['Monday','Tuesday','Wednesday','Thursday','Friday', ...classes.map(section => section.day)])];
  return '<div class="schedule-scroll" role="region" tabindex="0" aria-label="Published weekly timetable; scroll horizontally for all days"><div class="schedule-grid">' + days.map(day => '<div class="day-column"><div class="day-title">' + esc(day) + '</div>' + classes.filter(section => section.day === day).sort((a,b) => a.start.localeCompare(b.start)).map(section => '<div class="class-card"><span>' + esc(timeRange(section)) + '</span><strong>' + esc(section.code) + ' · ' + esc(section.blockLabel || section.section) + '</strong><small>' + esc(section.title) + '<br>' + esc(section.room) + ' · ' + esc(section.instructor) + '</small></div>').join('') + '</div>').join('') + '</div></div>';
}
function schedule() {
  const student = studentById(selectedStudentId);
  const classes = student ? enrolled(student.id) : [];
  const days = [...new Set(['Monday','Tuesday','Wednesday','Thursday','Friday', ...classes.map(section => section.day)])];
  return heading('Timetable', 'Student schedule', `Review meeting times for ${termLabel()}.`, '') + noticeHTML() +
    `<section class="panel"><div class="toolbar"><div class="toolbar-left"><label class="sr-only" for="schedule-student">Student</label><select class="select" id="schedule-student"><option value="">Choose a student</option>${data.students.map(item => `<option value="${esc(item.id)}" ${selectedStudentId === item.id ? 'selected' : ''}>${esc(fullName(item))} · ${esc(item.id)}</option>`).join('')}</select></div><span class="panel-note">${classes.length} allocated section${classes.length === 1 ? '' : 's'}</span></div>${student ? `<div class="schedule-grid" role="region" tabindex="0" aria-label="Weekly timetable; scroll horizontally for all days">${days.map(day => `<div class="day-column"><div class="day-title">${day}</div>${classes.filter(section => section.day === day).sort((a,b) => a.start.localeCompare(b.start)).map(section => `<div class="class-card"><span>${esc(timeRange(section))}</span><strong>${esc(section.code)} · ${esc(section.blockLabel || section.section)}</strong><small>${esc(section.title)}<br>${esc(section.room)}</small></div>`).join('')}</div>`).join('')}</div>` : empty('Select a student', 'Choose a student to see their timetable.')}</section><section class="panel" style="margin-top:18px"><div class="panel-head"><div><h2>Schedule list</h2><p class="panel-note">A compact view of each allocated class</p></div></div>${classes.length ? `<div class="table-wrap" role="region" tabindex="0" aria-label="Staff records table; scroll horizontally for all columns"><table class="data-table"><thead><tr><th>Subject</th><th>Section</th><th>Day</th><th>Time</th><th>Room</th><th>Instructor</th></tr></thead><tbody>${classes.map(section => `<tr><td><strong>${esc(section.code)}</strong><small>${esc(section.title)}</small></td><td>${esc(section.blockLabel || section.section)}</td><td>${esc(section.day)}</td><td>${esc(timeRange(section))}</td><td>${esc(section.room)}</td><td>${esc(section.instructor)}</td></tr>`).join('')}</tbody></table></div>` : empty('No classes scheduled', 'Allocate a section to this student to fill their timetable.')}</section>`;
}

function termsPage() {
  const nextYear = Number(data.term?.id?.slice(0, 4) || new Date().getFullYear()) + 1;
  return heading('Academic calendar', 'Academic terms', 'Choose the active term for sections and enrollment. Student IDs stay permanent.', '') + noticeHTML() +
    `<div class="dashboard-grid"><section class="panel"><div class="panel-head"><div><h2>Term history</h2><p class="panel-note">Switching terms shows its sections and allocations.</p></div></div><div class="term-list">${data.terms.map(term => `<div class="term-item"><div><strong>${esc(term.label)}</strong><small>${term.sections} sections · ${term.enrollments} enrollments</small></div>${term.active ? badge('Active') : `<button class="button small" data-action="activate-term" data-id="${esc(term.id)}" type="button">Make active</button>`}</div>`).join('')}</div></section><section class="panel"><div class="panel-head"><div><h2>Create a term</h2><p class="panel-note">New terms start empty and become active.</p></div></div><form id="term-form"><div class="field"><label for="term-year">Academic year starts *</label><input id="term-year" name="year" type="number" min="2000" max="2099" value="${nextYear}" required></div><div class="field term-semester"><label for="term-semester">Term *</label><select id="term-semester" name="semester"><option value="1">Semester 1</option><option value="2">Semester 2</option></select></div><div class="form-actions"><button class="button primary" type="submit">Create and activate</button></div></form></section></div>`;
}

function render() {
  $('#main form').each(function () { const saved = formDrafts.get(formKey(this)); if (saved) { saved.values = formValues(this); saved.dirty = JSON.stringify(saved.values) !== saved.baseline; } });
  if (draftStudentId) sectionDrafts.set(draftStudentId, [...draftSections]);
  if (assignmentStudentId) subjectDrafts.set(assignmentStudentId, [...assignmentCodes]);
  if (draftStudentId !== selectedStudentId) { draftStudentId = selectedStudentId; draftSections = [...(sectionDrafts.get(selectedStudentId) || [])]; }
  const revision = ++viewRevision;
  if (!ready) { $('#main').html('<div class="empty">Opening registry…</div>'); return; }
  $('body').toggleClass('auth-screen', !auth.authenticated);
  $('.staff-practice-label').remove();
  if (publicConfig.practice === true) $('.topbar-brand, .staff-public-header .university-brand > span').append(' <small class="badge staff-practice-label">Practice mode</small>');
  if (!auth.authenticated) {
    $('#main').html(`<div class="staff-entry"><section class="staff-entry-copy"><h1>Good records.<br>Clearer decisions.</h1><p>The PLP workspace for student records, subject assignments, and enrollment. Sign in with your staff role to continue.</p><div class="staff-role-guide"><div><strong>Registrar</strong><span>Review registrations, prepare schedules, and confirm accepted enrollments.</span></div><div><strong>Department Head</strong><span>Review special cases and assign eligible subjects for the Registrar to schedule.</span></div></div><p class="staff-entry-foot">Pamantasan ng Lungsod ng Pasig</p></section><section class="panel form-panel"><div class="panel-head"><div><h2>${auth.configured ? 'Staff sign in' : 'Set up Registrar access'}</h2><p class="panel-note">${auth.configured ? 'Welcome back. Open your academic workspace.' : 'Create the Registrar password for this enrollment workspace.'}</p></div></div>${noticeHTML()}${startupError ? `<div class="notice error" role="alert">${esc(startupError)} The enrollment service is unavailable. Please try again shortly.</div>` : ''}<form id="auth-form">${auth.configured ? '<div class="field"><label for="staff-role">Staff role *</label><select id="staff-role" name="role"><option value="registrar">Registrar</option><option value="department_head">Department Head</option></select><span class="field-help">Use the password assigned to your staff role.</span></div>' : ''}${inputField('Password *', 'password', `type="password" minlength="8" maxlength="${auth.configured ? 128 : 72}" autocomplete="${auth.configured ? 'current-password' : 'new-password'}" required`)}${!auth.configured ? inputField('Confirm password *', 'passwordConfirm', 'type="password" minlength="8" maxlength="72" autocomplete="new-password" required') + '<p class="field-help">Use at least 8 characters and at most 72 UTF-8 bytes.</p>' : ''}<div class="form-actions"><button class="button primary" type="submit">${auth.configured ? 'Sign in to workspace' : 'Set password and continue'} <i class="ph ph-arrow-right" aria-hidden="true"></i></button></div></form><p class="staff-entry-foot"><a class="understated-link" href="/">Back to enrollment home</a></p></section></div>`);
    return;
  }
  if (startupError) { $('#main').html(`<div class="page-heading"><div><h1>Registry unavailable</h1><p class="subtitle">Start the local server with npm run dev, then reload this page.</p></div></div><div class="notice error" role="alert">${esc(startupError)}</div>`); return; }
  if (!isRegistrar() && !['overview','students','assignments','curriculum','reports','audit','schedule','evaluation','practice'].includes(page) && !/^student:[^:]+$/.test(page)) page = 'assignments';
  if (page.startsWith('student:') || page.startsWith('student-edit:')) { selectedStudentId = page.split(':')[1]; if (!studentById(selectedStudentId)) { page = 'students'; selectedStudentId = ''; } }
  syncRoute();
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
  else if (page === 'curriculum') html = curriculumPage();
  else if (page === 'assignments') html = assignmentsPage();
  else if (page === 'reports') html = reportsPage();
  else if (page === 'audit') html = heading('', 'Audit history', 'Recorded actions for the records available to your role.') + noticeHTML() + '<section class="panel" id="remote-results" aria-live="polite">Loading audit history…</section>';
  else if (page === 'evaluation') html = evaluationPage();
  else if (page === 'blocks') html=blocksPage();
  else if (page === 'resources') html = resourcesPage();
  else if (page === 'access') html = recoveryPage();
  else if (page === 'practice') html = practicePage();
  else if (page === 'staff') html = staffPage();
  else html = termsPage();
  $('#main').html(html);
  $('.top-actions .role').text(isRegistrar() ? 'Registrar signed in' : 'Department Head signed in');
  $('.top-actions .avatar').text(isRegistrar() ? 'R' : 'DH');
  $('.nav-link').each(function () { this.hidden = !isRegistrar() && !['overview','students','curriculum','assignments','schedule','reports','audit','evaluation','practice'].includes(this.dataset.page); });
  if (!isRegistrar()) $('#main [data-page="student-new"], #main [data-action="student-edit"], #main [data-page="enroll"]').remove();
  if (!$('#logout-button').length) $('.top-actions').append('<button id="logout-button" class="button small" type="button">Sign out</button>');
  $('#active-term-label').text(termLabel());
  $('.nav-link').removeClass('active').removeAttr('aria-current');
  const navPage = page.startsWith('student') ? 'students' : page.startsWith('section') ? 'sections' : page;
  $(`.nav-link[data-page="${navPage}"]`).addClass('active').attr('aria-current', 'page');
  if (page.startsWith('student-new') || page.startsWith('student-edit:')) $('#admitted').datepicker({ dateFormat: 'mm/dd/yy', changeMonth: true, changeYear: true, yearRange: '1990:+0', maxDate: 0 });
  if (page.startsWith('student-new') || page.startsWith('student-edit:')) $('#birth').datepicker({ dateFormat: 'mm/dd/yy', changeMonth: true, changeYear: true, yearRange: '1950:+0', maxDate: 0 });
  if (page === 'section-new') $('#section-form .form-grid').append(`<div class="field full"><label for="prerequisites">Curriculum prerequisites</label><input id="prerequisites" readonly placeholder="Choose a curriculum subject" aria-describedby="section-prerequisite-help"><span class="field-help" id="section-prerequisite-help">Filled automatically from the curriculum. Update requirements in Curriculum.</span><span class="sr-only" id="section-prerequisite-status" role="status"></span></div>`);
  if (page.startsWith('student:')) {
    const student = studentById(page.split(':')[1]);
    if (isRegistrar() && !student.reviewedAt) $('#main > .page-heading').after(`<div class="notice" role="status">Registration awaiting registrar review. <button class="button small" data-action="review-student" data-id="${esc(student.id)}" type="button">Confirm registration for ${esc(fullName(student))}</button></div>`);
    $('#main .panel:first').append(`<div class="detail-row"><span>Permanent block</span><span>${esc(student.homeBlock?.label || 'Not assigned')}</span></div>${isRegistrar() ? `<button class="button small" data-page="blocks" data-student="${esc(student.id)}" type="button">Manage home block</button>` : ''}`);
    const completed = (data.completed || []).filter(item => item.studentId === student.id).map(item => item.code);
    $('#main .panel:last').append(`<div class="form-actions"><button class="button" data-page="assignments" data-student="${esc(student.id)}" type="button">Review subject assignment</button></div>${planSummary(planFor(student.id))}`);
    $('#main .panel:first').append(`<div class="detail-row"><span>Student type · staff only</span><span>${esc(types[student.studentType] || 'Regular')}</span></div><div class="detail-row"><span>Semester</span><span>${esc(student.semester || 1)}</span></div><div class="detail-row"><span>Birth date</span><span>${esc(student.birth || 'Not recorded')}</span></div><div class="detail-row"><span>Gender</span><span>${esc(student.gender || 'Not recorded')}</span></div><div class="detail-row"><span>Address</span><span>${esc(student.address || 'Not recorded')}</span></div><div class="detail-row"><span>Contact number</span><span>${esc(student.phone || 'Not recorded')}</span></div><div class="detail-row"><span>Completed subjects</span><span>${esc(completed.join(', ') || 'None recorded')}</span></div><div class="form-actions"><button class="button" data-page="evaluation" data-student="${esc(student.id)}" type="button">View individual evaluation</button></div>`);
  }
  initializeWorkflowWidgets();
  restoreForms();
  if (page === 'reports' || page === 'audit') loadRemotePage(revision);
  if (['evaluation','assignments'].includes(page) && selectedStudentId && !evaluations.has(selectedStudentId)) loadEvaluation(revision);
  updateGradePreview();
  if (page === 'access') updateRecoveryRole();
  if (page === 'resources') $('#resource-kind').trigger('change');
  if (page==='blocks') initializeBlockWidgets();
  if (page === 'section-new') {
    updateSectionCurriculum();
    const room = (data.resources || []).find(row => row.kind === 'room' && row.name === $('#room').val());
    if (room?.capacity) $('#capacity').attr('max', room.capacity);
  }

}

$(document).on('submit', '#auth-form', async function (event) {
  event.preventDefault();
  try {
    if (!auth.configured && this.elements.password.value !== this.elements.passwordConfirm.value) throw new Error('The passwords do not match.');
    await api(auth.configured ? '/auth/login' : '/auth/setup', 'POST', { role: this.elements.role?.value || 'registrar', password: this.elements.password.value });
    auth = { configured: true, authenticated: true };
    await bootstrap();
  } catch (error) { alertUser(error.message, 'error'); }
});
$(document).on('click', '#logout-button', async function () {
  try { await api('/auth/logout', 'POST'); } catch (error) { alertUser(error.message, 'error'); return; }
  evaluations.clear(); resultPreviews.clear(); recoveryResult = null;
  formDrafts.clear(); sectionDrafts.clear(); subjectDrafts.clear(); draftSections = []; draftStudentId = ''; assignmentCodes = []; assignmentStudentId = '';
  selectedStudentId = ''; query = ''; filter = 'All'; page = 'overview';
  history.replaceState({}, '', location.pathname + '?view=overview');
  auth.authenticated = false;
  data = { students: [], sections: [], enrollments: [] };
  render();
});
$(document).on('click', '[data-action="review-student"]', function () {
  const student = studentById(this.dataset.id);
  $('#confirm-dialog').html(`<p>Confirm registration for <strong>${esc(fullName(student))}</strong> (${esc(student.id)})?</p><p>Student type: <strong>${esc(types[student.studentType] || 'Regular')}</strong><br>Semester: <strong>${esc(student.semester || 1)}</strong></p><p>Verify the classification before confirming. It controls which staff role may assign subjects.</p>`).dialog({ title: 'Review student registration', modal: true, resizable: false, width: Math.min(540, window.innerWidth - 30), buttons: [
    { text: 'Edit classification', click() { $(this).dialog('close'); page = `student-edit:${student.id}`; render(); } },
    { text: 'Confirm registration', async click() { const dialog = $(this); dialog.parent().find('button').prop('disabled', true); try { await api(`/students/${encodeURIComponent(student.id)}/review`, 'POST'); await refreshData(); dialog.dialog('close'); alertUser('Student registration and classification confirmed.'); } catch (error) { dialog.dialog('close'); alertUser(error.message, 'error'); } finally { dialog.parent().find('button').prop('disabled', false); } } }
  ] });
});

$(document).on('click', '[data-page]', function () {
  if (!staffViews.includes(this.dataset.page)) return;
  page = this.dataset.page;
  if (this.dataset.student) selectedStudentId = this.dataset.student;
  render(); $('#main').trigger('focus');
});
$(document).on('click', '[data-action="student-detail"]', function () { page = `student:${this.dataset.id}`; render(); $('#main').trigger('focus'); });
$(document).on('click', '[data-action="student-edit"]', function () { page = `student-edit:${this.dataset.id}`; render(); $('#main').trigger('focus'); });
$(document).on('input', '#student-search, #section-search', function () {
  const position = this.selectionStart; query = this.value; syncRoute(true); render(); const next = document.getElementById(this.id); next.focus(); next.setSelectionRange(position, position);
});
$(document).on('change', '#student-filter', function () { filter = this.value; render(); });
$(document).on('change', '#schedule-student', function () { selectedStudentId = this.value; render(); });
$(document).on('submit', '#term-form', async function (event) {
  event.preventDefault();
  try { await api('/terms', 'POST', Object.fromEntries(new FormData(this))); clearFormDraft(this); await refreshData(); alertUser(`${termLabel()} is now active.`); }
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
    for (const [label, value] of [['birth date', fields.birth], ['admission date', fields.admitted]]) {
      const parsed = $.datepicker.parseDate('mm/dd/yy', value);
      if (parsed > new Date()) throw new Error(label);
    }
  } catch { alertUser('Enter valid birth and admission dates that are not in the future.', 'error'); return; }
  try {
    const record = await api(id ? `/students/${encodeURIComponent(id)}` : '/students', id ? 'PUT' : 'POST', { ...fields, email });
    clearFormDraft(this);
    await refreshData();
    selectedStudentId = record.id;
    page = `student:${record.id}`;
    alertUser(id ? 'Student record updated.' : `Student registered with number ${record.id}.`);
  } catch (error) { alertUser(error.message, 'error'); }
});
$(document).on('submit', '#section-form', async function (event) {
  event.preventDefault(); const fields = Object.fromEntries(new FormData(this));
  try { for (const value of [fields.startDate, fields.endDate].filter(Boolean)) $.datepicker.parseDate('yy-mm-dd', value); } catch { alertUser('Use valid academic dates in YYYY-MM-DD format.', 'error'); return; }
  if (fields.startDate && fields.endDate && fields.startDate > fields.endDate) { alertUser('End date must be on or after start date.', 'error'); return; }
  if (fields.start >= fields.end) { alertUser('End time must be later than start time.', 'error'); return; }
  try { await api('/sections', 'POST', fields); clearFormDraft(this); await refreshData(); page = 'sections'; alertUser('Section created. It is ready for student allocation.'); }
  catch (error) { alertUser(error.message, 'error'); }
});
$(document).on('submit', '#enroll-form', async function (event) {
  event.preventDefault(); const fields = Object.fromEntries(new FormData(this));
  const student = studentById(selectedStudentId);
  const section = sectionById(fields.sectionId);
  if (!student || student.status !== 'Active' || !student.reviewedAt) { alertUser('Choose an active student whose registration has been reviewed.', 'error'); return; }
  selectedStudentId = student.id;
  if (draftStudentId !== student.id) { draftStudentId = student.id; draftSections = []; }
  if (!section) { alertUser('Choose a section.', 'error'); return; }
  if (count(section.id) >= section.capacity) { alertUser('This section is full. Choose another section.', 'error'); return; }
  if (draftSections.map(sectionById).some(item => item?.code === section.code)) { alertUser('This section is already in the enrollment list or schedule.', 'error'); return; }
  const completed = (data.completed || []).filter(item => item.studentId === student.id).map(item => item.code);
  const missing = (section.prerequisites || '').split(',').map(code => code.trim()).filter(code => code && !completed.includes(code));
  if (missing.length) { alertUser(`Prerequisite not completed: ${missing.join(', ')}. Choose another subject.`, 'error'); return; }
  const conflict = draftSections.map(sectionById).filter(Boolean).some(item => item.day === section.day && item.start < section.end && section.start < item.end);
  if (conflict) { alertUser('Schedule conflict. Choose a different date or time.', 'error'); return; }
  draftSections.push(section.id);
  alertUser(`${section.code} · ${section.blockLabel || section.section} added to the enrollment list.`);
});
$(document).on('click', '[data-action="remove-draft"]', function () {
  draftSections = draftSections.filter(id => id !== this.dataset.id);
  render();
});
$(document).on('click', '[data-action="confirm-draft"]', function () {
  const student = studentById(draftStudentId);
  const sections = draftSections.map(sectionById).filter(Boolean);
  const plan = planFor(student?.id);
  if (plan && !['draft','declined'].includes(plan.status)) { alertUser('This student already has a published offer for this term.', 'error'); return; }
  if (plan?.status === 'draft' && (plan.subjects.length !== sections.length || !sections.every(section => plan.subjects.includes(section.code)))) { alertUser('Choose exactly one section for every assigned subject.', 'error'); return; }
  if (isSpecial(student) && (!assignedByHead(plan) || plan.status === 'declined' || !plan.subjects?.length || plan.subjects.length !== sections.length || !sections.every(section => plan.subjects.includes(section.code)))) { alertUser('Include exactly one section for every current Department Head assigned subject.', 'error'); return; }
  if (!student || !sections.length) return;
  $('#confirm-dialog').html(`<p>Publish a schedule offer for <strong>${esc(fullName(student))}</strong> (${esc(student.id)})?</p><ul>${sections.map(section => `<li>${esc(sectionLabel(section))} — ${esc(section.day)}, ${esc(timeRange(section))}, ${esc(section.room)}; ${count(section.id)}/${section.capacity} seats reserved</li>`).join('')}</ul><p>Publishing reserves seats while the student decides. Declining releases them. The server checks prerequisites, conflicts, and capacity before publishing.</p>`).dialog({ modal: true, resizable: false, width: Math.min(560, window.innerWidth - 30), buttons: [
    { text: 'Change list', click() { $(this).dialog('close'); } },
    { text: 'Publish offer', async click() {
      const dialog = $(this); dialog.parent().find('button').prop('disabled', true);
      try { await api('/enrollments/offer', 'POST', { studentId: student.id, sectionIds: sections.map(section => section.id) }); await refreshData(); draftSections = []; sectionDrafts.delete(student.id); for (const key of formDrafts.keys()) if (key.startsWith('enroll:' + student.id + ':')) formDrafts.delete(key); $(this).dialog('close'); page = 'enroll'; alertUser(`Offer published for ${fullName(student)}. Awaiting student acceptance.`); }
      catch (error) { $(this).dialog('close'); alertUser(error.message, 'error'); }
      finally { dialog.parent().find('button').prop('disabled', false); }
    } }
  ] });
});
$(document).on('click', '[data-action="drop"]', function () {
  const studentId = this.dataset.student, sectionId = this.dataset.section;
  const student = studentById(studentId), section = sectionById(sectionId);
  $('#confirm-dialog').html(`Remove <strong>${esc(fullName(student))}</strong> from <strong>${esc(section.code)} · ${esc(section.blockLabel || section.section)}</strong>?`).dialog({ modal: true, resizable: false, width: Math.min(420, window.innerWidth - 30), buttons: [
    { text: 'Cancel', click() { $(this).dialog('close'); } },
    { text: 'Remove allocation', async click() { try { await api('/enrollments', 'DELETE', { studentId, sectionId }); await refreshData(); $(this).dialog('close'); alertUser('Section allocation removed.'); } catch (error) { $(this).dialog('close'); alertUser(error.message, 'error'); } } }
  ] });
});

function eligibleSubjects(student) {
  const evaluation = evaluations.get(student.id);
  if (evaluation) return evaluation.curriculum.filter(subject => subject.eligible);
  const failed = (data.results || []).filter(row => row.studentId === student.id && row.remark === 'failed');
  const choice = (data.backChoices || []).find(row => row.studentId === student.id);
  if (failed.length && !choice) return [];
  const completed = (data.completed || []).filter(c => c.studentId === student.id).map(c => c.code);
  return (data.curriculum || []).filter(c => (!failed.some(row => row.code === c.code) || choice?.codes.includes(c.code)) && c.program === student.program &&
    (isSpecial(student) || (Number(c.yearLevel) === Number.parseInt(student.level, 10) && Number(c.semester) === activeSemester())) &&
    !completed.includes(c.code) && String(c.prerequisites || '').split(',').map(v => v.trim()).filter(Boolean).every(code => completed.includes(code)) &&
    data.sections.some(section => section.catalogMatch !== false && section.code === c.code && count(section.id) < section.capacity));
}
function studentPicker(id, student) {
  return `<section class="panel workflow-picker"><label for="${id}">Find student</label><input id="${id}" class="search" placeholder="Search student name or ID" value="${student ? esc(`${fullName(student)} (${student.id})`) : ''}" autocomplete="off"><span class="field-help">Select a result to open the student’s current term record.</span></section>`;
}
function curriculumPage() {
  const entries = (data.curriculum || []).filter(c => Object.entries(curriculumFilter).every(([key, value]) => !value || String(c[key]) === value));
  return heading('', 'Curriculum', 'Manage program subjects, units and prerequisites by year level and semester.') + noticeHTML() + `<section class="panel"><div class="panel-head"><div><h2>2022–2023 curricula</h2><p class="panel-note">BSIT · 49 subjects · 146 units &nbsp; | &nbsp; BSCS · 51 subjects · 146 units</p></div>${isRegistrar() ? '<button class="button" id="import-plp-curriculum" type="button">Load supplied curricula</button>' : ''}</div><div class="button-row"><a class="text-button" href="/curriculum/2022-bsit.pdf" target="_blank" rel="noopener">BSIT curriculum PDF</a><a class="text-button" href="/curriculum/2022-bscs.pdf" target="_blank" rel="noopener">BSCS curriculum PDF</a></div><p class="field-help">Summer subjects retain their own term in this catalog. Enrollment terms currently support Semesters 1 and 2.</p></section>` +
    `<section class="panel" id="curriculum-catalog"><form id="curriculum-filter" class="filter-grid">${selectField('Program', 'curriculum-program', programs(), curriculumFilter.program, 'All programs')}${selectField('Year level', 'curriculum-yearLevel', [1,2,3,4], curriculumFilter.yearLevel, 'All years')}${selectField('Semester', 'curriculum-semester', [1,2,3], curriculumFilter.semester, 'All semesters')}<button class="button" type="submit">Apply filters</button></form>${entries.length ? table(['Code','Subject','Units','Program','Year','Semester','Prerequisites','Curriculum'], entries.map(c => `<tr>${[c.code,c.title,c.units,c.program,c.yearLevel,semesterLabel(c.semester),prerequisiteLabel(c),c.source || 'Staff entry'].map(v => `<td>${esc(v)}</td>`).join('')}</tr>`)) : empty('No curriculum subjects', 'The registrar can add verified subjects below. Curriculum entries are required before offering sections.')}</section>` +
    (isRegistrar() ? `<section class="panel form-panel separated-panel"><div class="panel-head"><div><h2>Add curriculum subject</h2><p class="panel-note">Use the exact subject code used by your sections.</p></div></div><form id="curriculum-form"><div class="form-grid">${inputField('Subject code *','curriculum-code','name="code" required maxlength="20"')}${inputField('Subject title *','curriculum-title','name="title" required maxlength="100"')}${inputField('Units *','curriculum-units','name="units" type="number" min="0.5" max="12" step="0.5" required')}${inputField('Program *','curriculum-entry-program','required maxlength="100" autocomplete="off" placeholder="Enter the official program name"')}${selectField('Year level *','curriculum-entry-year',[1,2,3,4])}${selectField('Semester *','curriculum-entry-semester',[1,2,3])}${inputField('Prerequisite codes, separated by commas','curriculum-prerequisites','name="prerequisites" maxlength="500"')}</div><div class="form-actions"><button class="button primary" type="submit">Save curriculum subject</button></div></form></section>` : '');
}
function assignmentsPage() {
  const evaluation = evaluations.get(selectedStudentId);
  if (selectedStudentId && !evaluation) return heading('', 'Subject assignments', 'Review eligibility before approving subjects.') + noticeHTML() + studentPicker('assignment-student', studentById(selectedStudentId)) + '<section class="panel" id="evaluation-content" aria-live="polite">Loading subject eligibility…</section>';
  const student = studentById(selectedStudentId), allowed = canAssign(student) && !evaluation?.needsBackSubjectDecision;
  if (assignmentStudentId !== selectedStudentId) { assignmentStudentId = selectedStudentId; assignmentCodes = [...(subjectDrafts.get(selectedStudentId) || planFor(selectedStudentId)?.subjects || [])]; }
  const eligible = student ? eligibleSubjects(student) : [];
  const locked = planFor(student?.id) && !['draft','declined'].includes(planFor(student.id).status);
  return heading('', 'Subject assignments', isRegistrar() ? 'Assign regular students from their program, year, and active semester curriculum.' : 'Assign subjects for special students after reviewing their records and prerequisites.') + noticeHTML() + studentPicker('assignment-student', student) +
    (student ? `<section class="panel"><div class="panel-head"><div><h2>${esc(fullName(student))}</h2><p class="panel-note">${esc(student.id)} · ${esc(student.program)} · ${esc(student.level)} · ${esc(types[student.studentType])} · staff only</p></div></div>${planSummary(planFor(student.id))}${backChoiceNotice(evaluation)}<div class="button-row"><button class="button small" data-page="evaluation" data-student="${esc(student.id)}" type="button">Individual evaluation</button></div>${locked ? '<div class="notice">This offer is already published. Subject reassignment is available after the student declines.</div>' : ''}${allowed && !locked ? `<form id="assignment-form"><div class="field"><label for="assignment-subject">Find eligible subject</label><input id="assignment-subject" placeholder="Search code or subject title" autocomplete="off"><span class="field-help">Subjects need matching curriculum, completed prerequisites, and an open section.${isRegistrar() ? ' Regular subjects must also match the student’s year and active semester.' : ''}</span></div><div id="assignment-list">${assignmentCodes.length ? assignmentCodes.map(code => `<div class="section-item"><div><strong>${esc(code)}</strong><small>${esc((data.curriculum || []).find(c => c.code === code && c.program === student.program)?.title || 'Curriculum entry needed')}</small>${!eligible.some(c => c.code === code) ? '<small class="validation-text">Currently ineligible. Remove this subject or resolve its curriculum, prerequisites, or section availability.</small>' : ''}</div><button class="text-button" data-action="remove-assignment" data-code="${esc(code)}" type="button">Remove</button></div>`).join('') : empty('No subjects assigned', 'Search an eligible subject above and select a result.')}</div><div class="form-actions"><button class="button primary" type="submit" ${!assignmentCodes.length || !student.reviewedAt || assignmentCodes.some(code => !eligible.some(c => c.code === code)) ? 'disabled' : ''}>${isRegistrar() ? 'Save subject assignment' : 'Approve subject assignment'}</button></div>${!student.reviewedAt ? '<p class="field-help">The registrar must review the registration first.</p>' : ''}</form>${!eligible.length ? empty('No eligible subjects', 'Check curriculum entries, completed prerequisites, and open sections in the active term.') : ''}` : `<div class="notice">${evaluation?.needsBackSubjectDecision ? 'Awaiting the student’s failed-subject decision. Ask the student to sign in to their portal to choose or defer back subjects.' : locked ? 'Use the schedule view to review the published offer.' : isRegistrar() ? 'Special students require subject assignment by the Department Head.' : 'Regular students are assigned by the registrar.'}</div>`}</section>` : empty('Choose a student', 'Find a student to review their subject assignment.'));
}
function reportsPage() {
  return heading('', 'Enrollment reports', 'Filter the report, then download the same selection as CSV.') + noticeHTML() + `<section class="panel"><form id="report-form" class="filter-grid"><div class="field"><label for="report-term">Term</label><select id="report-term"><option value="">All terms</option>${(data.terms || []).map(t => `<option value="${esc(t.id)}" ${reportFilter.term === t.id ? 'selected' : ''}>${esc(t.label)}</option>`).join('')}</select></div>${selectField('Program','report-program',programs(),reportFilter.program,'All programs')}${selectField('Status','report-status',['unassigned','draft','pending','accepted','declined','confirmed'],reportFilter.status,'All statuses')}<div class="button-row"><button class="button" type="submit">Apply filters</button><button class="button primary" id="download-report" type="button">Download CSV</button></div></form><div id="remote-results" aria-live="polite">Loading report…</div></section>`;
}
function staffPage() {
  if (auth.departmentHeadConfigured) return heading('', 'Staff access', 'Department Head access is configured.') + noticeHTML() + '<section class="panel form-panel"><h2>Department Head account</h2><p class="workflow-explanation">Verify the account holder’s identity using the school-approved process before issuing a password reset link.</p><button class="button primary" data-page="access" type="button">Open account recovery</button></section>';
  return heading('', 'Staff access', 'Configure the Department Head password for special subject assignments.') + noticeHTML() + `<section class="panel form-panel"><h2>${'Set up Department Head access'}</h2><p class="panel-note">Department Heads can review special student records and assign subjects. The registrar publishes and confirms schedule offers.</p><form id="staff-form"><div class="form-grid">${inputField('New password *','dh-password','name="password" type="password" minlength="8" maxlength="72" autocomplete="new-password" required')}${inputField('Confirm password *','dh-password-confirm','type="password" minlength="8" maxlength="72" autocomplete="new-password" required')}</div><div class="form-actions"><button class="button primary" type="submit">Save Department Head password</button></div><p class="field-help">Use at least 8 characters and at most 72 UTF-8 bytes. Accented characters and emoji may use more than one byte.</p></form></section>`;
}
function initializeWorkflowWidgets() {
  $('#offer-student, #assignment-student, #evaluation-student, #recovery-target').autocomplete({ minLength: 1, source: data.students.map(student => ({ label: `${fullName(student)} (${student.id})`, value: `${fullName(student)} (${student.id})`, id: student.id })), select: (_event, ui) => {
    if (_event.target.id === 'recovery-target') { $('#recovery-target').val(ui.item.id).trigger('change'); return false; }
    selectedStudentId = ui.item.id;
    setTimeout(render, 0);
  } });
  const student = studentById(selectedStudentId);
  if (student) $('#assignment-subject').autocomplete({ minLength: 0, source: eligibleSubjects(student).filter(c => !assignmentCodes.includes(c.code)).map(c => ({ label: `${c.code} · ${c.title}`, value: c.code })), select: (_event, ui) => { if (assignmentCodes.length >= 12) { alertUser('An assignment may contain at most 12 subjects.', 'error'); return false; } assignmentCodes.push(ui.item.value); setTimeout(render, 0); } });
  $('#program').each(function () {
    const current = this.value;
    $(this).replaceWith(`<input id="program" name="program" value="${esc(current)}" required maxlength="100" autocomplete="off">`);
    $('#program').autocomplete({ minLength: 0, source: programs() });
  });
  $('#curriculum-semester, #curriculum-entry-semester').find('option[value="3"]').text('Summer');
  $('#result-code').autocomplete({ minLength: 0, source: (evaluations.get(selectedStudentId)?.curriculum || []).map(row => ({ label: `${row.code} · ${row.title}`, value: row.code })) });
  $('#curriculum-entry-program').autocomplete({ minLength: 0, source: programs() });
  $('#code').autocomplete({ minLength: 0, source: [...new Map((data.curriculum || []).map(subject => [subject.code,{label:subject.code+' · '+subject.title,value:subject.code}])).values()], select: (_event, ui) => { $('#code').val(ui.item.value); updateSectionCurriculum(); return false; } });
  if (page === 'section-new') $('#title').prop('readOnly',true);
  if (page === 'section-new') {
    for (const [field, kind] of [['instructor','professor'], ['room','room']]) {
      const resources = (data.resources || []).filter(row => row.kind === kind);
      $('#' + field).replaceWith(`<select id="${field}" name="${field}" required><option value="">Choose ${kind === 'room' ? 'a room' : 'a professor'}</option>${resources.map(row => `<option value="${esc(row.name)}">${esc(row.name)}${kind === 'room' ? ` · ${esc(row.capacity)} seats` : ''}</option>`).join('')}</select>`);
      if (!resources.length) $('#' + field).after('<span class="field-help">Add entries in Rooms &amp; professors before creating a section.</span>');
    }
    $('#section-form .form-grid').append(inputField('First meeting date (optional)', 'startDate', 'placeholder="YYYY-MM-DD"') + inputField('Last meeting date (optional)', 'endDate', 'placeholder="YYYY-MM-DD"'));
    $('#startDate, #endDate').datepicker({ dateFormat: 'yy-mm-dd', changeMonth: true, changeYear: true });
  }
}
async function loadRemotePage(revision) {
  const target = page;
  try {
    const rows = await api(target === 'reports' ? `/reports?${new URLSearchParams(reportFilter)}` : '/audit');
    if (revision !== viewRevision || target !== page) return;
    $('#remote-results').html(rows.length ? (target === 'reports' ? table(['Student ID','Name','Program','Year','Term','Status','Subjects','Block / section'], rows.map(r => `<tr>${[r.studentId,r.name,r.program,r.level,r.term,stateLabel(r.status),Array.isArray(r.subjects) ? r.subjects.join(', ') : r.subjects,Array.isArray(r.sections) ? r.sections.join(', ') : r.sections].map(v => `<td>${esc(v)}</td>`).join('')}</tr>`)) : table(['Time','Actor','Action','Entity','Record'],rows.map(r => `<tr>${[r.at,roleLabel(r.actor),r.action,r.entity,r.entityId].map(v => `<td>${esc(v)}</td>`).join('')}</tr>`))) : empty(target === 'reports' ? 'No matching report rows' : 'No audit entries', target === 'reports' ? 'Try another term, program, or status.' : 'Recorded staff actions will appear here.'));
  } catch (error) { if (revision === viewRevision) $('#remote-results').html(`<div class="notice error" role="alert">${esc(error.message)}</div><button class="button" data-action="reload-remote" type="button">Try again</button>`); }
}
async function submitWorkflow(form, operation) {
  if (form.dataset.busy) return;
  form.dataset.busy = 'true';
  const buttons = $(form).find('button[type="submit"]').prop('disabled', true);
  $(form).attr('aria-busy', 'true');
  try { await operation(); } catch (error) { alertUser(error.message, 'error'); }
  finally { delete form.dataset.busy; buttons.prop('disabled', false); $(form).removeAttr('aria-busy'); }
}
$(document).on('click', '#import-plp-curriculum', function () {
  $('#confirm-dialog').html('<p>Load the supplied <strong>2022–2023 BSIT and BSCS curricula</strong>?</p><p>Existing matching entries are kept. Conflicting curriculum or academic credit records must be reviewed before import.</p>').dialog({title:'Load supplied curricula',modal:true,width:Math.min(560,window.innerWidth-24),buttons:[{text:'Cancel',click(){$(this).dialog('close');}},{text:'Load curricula',async click(){const dialog=$(this);dialog.parent().find('button').prop('disabled',true);try{const result=await api('/curriculum/import-2022','POST',{});await refreshData();dialog.dialog('close');alertUser(result.inserted+' curriculum entries loaded; '+result.existing+' already present.');}catch(error){dialog.dialog('close');alertUser(error.message,'error');}finally{dialog.parent().find('button').prop('disabled',false);}}}]});
});
$(document).on('submit', '#curriculum-filter', function (event) { event.preventDefault(); curriculumFilter = { program: $('#curriculum-program').val(), yearLevel: $('#curriculum-yearLevel').val(), semester: $('#curriculum-semester').val() }; render(); });
$(document).on('submit', '#curriculum-form', function (event) {
  event.preventDefault();
  submitWorkflow(this, async () => { const fields = Object.fromEntries(new FormData(this)); await api('/curriculum','POST',{ ...fields, code: $('#curriculum-code').val(), title: $('#curriculum-title').val(), units: Number($('#curriculum-units').val()), program: $('#curriculum-entry-program').val(), yearLevel: Number($('#curriculum-entry-year').val()), semester: Number($('#curriculum-entry-semester').val()), prerequisites: $('#curriculum-prerequisites').val() }); clearFormDraft(this); await refreshData(); alertUser('Curriculum subject saved.'); });
});
$(document).on('click', '[data-action="remove-assignment"]', function () { assignmentCodes = assignmentCodes.filter(code => code !== this.dataset.code); render(); });
$(document).on('submit', '#assignment-form', function (event) {
  event.preventDefault();
  submitWorkflow(this, async () => {
    const id = selectedStudentId, codes = [...assignmentCodes];
    if (!canAssign(studentById(id))) throw new Error('This student requires assignment by the other staff role.');
    const evaluation = await api(`/evaluation/${encodeURIComponent(id)}`);
    if (evaluation.needsBackSubjectDecision) throw new Error('Wait for the student’s back-subject decision.');
    if (codes.some(code => !evaluation.curriculum.some(row => row.code === code && row.eligible))) throw new Error('Eligibility changed. Reopen individual evaluation before saving.');
    await api('/assignments','POST',{ studentId: id, codes }); clearFormDraft(this); subjectDrafts.delete(id); await refreshData();
    assignmentCodes = [...(planFor(id)?.subjects || [])];
    alertUser(isRegistrar() ? 'Subject assignment saved. Prepare the section offer next.' : 'Subject assignment approved. The Registrar can now prepare the schedule offer.');
  });
});
$(document).on('submit', '#staff-form', function (event) {
  event.preventDefault(); submitWorkflow(this, async () => { if ($('#dh-password').val() !== $('#dh-password-confirm').val()) throw new Error('The passwords do not match.'); await api('/staff/department-head','POST',{ password: $('#dh-password').val() }); auth = await api('/auth/status'); alertUser('Department Head password saved.'); });
});
$(document).on('submit', '#report-form', function (event) { event.preventDefault(); reportFilter = { term: $('#report-term').val(), program: $('#report-program').val(), status: $('#report-status').val() }; render(); });
$(document).on('click', '[data-action="reload-remote"]', render);
$(document).on('click', '#download-report', async function () {
  this.disabled = true;
  try {
    const response = await fetch(`/api/reports?${new URLSearchParams({ ...reportFilter, format: 'csv' })}`);
    if (!response.ok) { const result = await response.json().catch(() => ({})); throw new Error(result.error || 'Report download failed.'); }
    const url = URL.createObjectURL(await response.blob()); const link = document.createElement('a'); link.href = url; link.download = 'enrollment-report.csv'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) { alertUser(error.message, 'error'); } finally { this.disabled = false; }
});
$(document).on('click', '[data-action="confirm-accepted"]', function () {
  const student = studentById(this.dataset.id);
  $('#confirm-dialog').html(`<p>Confirm the accepted enrollment for <strong>${esc(fullName(student))}</strong> (${esc(student.id)})?</p>${planSummary(planFor(student.id))}<p>Seats were reserved when this offer was published and remain reserved after confirmation.</p>`).dialog({ title: 'Confirm accepted enrollment', modal: true, width: Math.min(540, window.innerWidth - 30), buttons: [
    { text: 'Cancel', click() { $(this).dialog('close'); } },
    { text: 'Confirm enrollment', async click() { const dialog = $(this); dialog.parent().find('button').prop('disabled', true); try { await api(`/enrollments/${encodeURIComponent(student.id)}/confirm`,'POST'); await refreshData(); dialog.dialog('close'); alertUser(`Enrollment confirmed for ${fullName(student)}.`); } catch (error) { dialog.dialog('close'); alertUser(error.message, 'error'); } finally { dialog.parent().find('button').prop('disabled', false); } } }
  ] });
});

document.addEventListener('invalid', event => {
  const input = event.target;
  input.setAttribute('aria-invalid','true');
  const id = `${input.id}-error`;
  if (!document.getElementById(id)) { const message = document.createElement('span'); message.id = id; message.className = 'field-error'; message.textContent = input.validationMessage; input.after(message); input.setAttribute('aria-describedby', id); }
}, true);
$(document).on('input change', 'input, select', function () { this.removeAttribute('aria-invalid'); const error = document.getElementById(`${this.id}-error`); if (error) { error.remove(); this.removeAttribute('aria-describedby'); } });

const remarkLabel = value => ({ passed: 'Passed', failed: 'Failed', not_taken: 'Not taken' })[value] || 'Not taken';
function backChoiceNotice(evaluation) {
  if (!evaluation?.failed.length) return '';
  const plan = evaluation.plan;
  let next;
  if (plan?.status === 'pending') next = 'The published schedule is read-only. Waiting for the student to accept or decline the offer.';
  else if (plan?.status === 'accepted') next = 'The student accepted the offer. The Registrar confirms enrollment next. The published schedule is read-only.';
  else if (plan?.status === 'confirmed') next = 'Enrollment is confirmed. The published schedule is read-only.';
  else if (evaluation.needsBackSubjectDecision) next = 'Waiting for the student to choose or defer failed subjects in their portal.';
  else if (plan?.status === 'draft' && assignedByHead(plan) && plan.subjects?.length) next = 'The Department Head approved the subject assignment. The Registrar prepares the schedule offer next.';
  else if (plan?.status === 'declined') next = 'The student declined the offer. The Department Head reviews and approves the revised subject assignment before the Registrar prepares another schedule offer.';
  else next = 'Department Head approval is required before scheduling.';
  const choice = evaluation.choice ? 'Student’s back-subject choice: ' + esc(evaluation.choice.codes?.length ? evaluation.choice.codes.join(', ') : 'Defer all failed subjects') + '. ' : '';
  return '<div class="notice">' + choice + next + '</div>';
}
async function loadEvaluation(revision) {
  const id = selectedStudentId, target = page;
  try {
    const evaluation = await api('/evaluation/' + encodeURIComponent(id));
    if (revision !== viewRevision || id !== selectedStudentId || target !== page) return;
    evaluations.set(id, evaluation);
    render();
  } catch (error) {
    if (revision === viewRevision) $('#evaluation-content').html('<div class="notice error" role="alert">' + esc(error.message) + '</div><button class="button" data-action="retry-evaluation" type="button">Try again</button>');
  }
}
function resultTable(rows) {
  return rows.length ? table(['Subject','Raw grade','Transmuted grade','Remark','Term'], rows.map(row => '<tr class="result-' + (row.remark === 'failed' ? 'failed' : row.remark === 'passed' ? 'passed' : 'not-taken') + '"><td><strong>' + esc(row.code) + '</strong><small>' + esc(row.title || '') + '</small></td><td>' + esc(row.rawGrade || 'Not recorded') + '</td><td>' + esc(row.grade || 'Not recorded') + '</td><td>' + esc(remarkLabel(row.remark)) + '</td><td>' + esc((data.terms || []).find(term => term.id === row.termId)?.label || row.termId || '—') + '</td></tr>')) : empty('No academic results', 'The Registrar can enter grades or import a CSV below.');
}
function evaluationPage() {
  const student = studentById(selectedStudentId), evaluation = evaluations.get(selectedStudentId);
  let html = heading('', 'Individual evaluation', 'Review academic results, prerequisites, and eligible subjects.', evaluation ? '<button class="button" id="print-evaluation" type="button">Print evaluation</button>' : '') + noticeHTML() + studentPicker('evaluation-student', student);
  if (!student) return html + empty('Choose a student', 'Find a student to evaluate their academic record.');
  if (!evaluation) return html + '<section class="panel" id="evaluation-content" aria-live="polite">Loading academic evaluation…</section>';
  const locked = evaluation.plan && !['draft','declined'].includes(evaluation.plan.status);
  html += '<ol class="workflow-steps"><li>Registrar records results</li><li>Student decides back subjects</li><li>Responsible staff approves subjects</li><li>Registrar schedules</li></ol>' + backChoiceNotice(evaluation);
  html += '<section class="panel evaluation-report" aria-label="Student evaluation report"><div class="panel-head"><div><h2>' + esc(evaluation.student.name) + '</h2><p class="panel-note">' + esc(evaluation.student.id) + ' · ' + esc(evaluation.student.program) + ' · ' + esc(evaluation.student.level) + '</p><p class="panel-note">' + esc(evaluation.term?.label || termLabel()) + ' · ' + esc(types[evaluation.student.studentType] || 'Regular') + '</p></div></div><div class="evaluation-summary"><span><strong>' + evaluation.results.length + '</strong> recorded results</span><span><strong>' + evaluation.failed.length + '</strong> failed subjects</span><span><strong>' + evaluation.curriculum.filter(row => row.eligible).length + '</strong> eligible subjects</span></div><h3>Academic results</h3>' + resultTable(evaluation.results) + '<h3>Curriculum eligibility</h3>' + (evaluation.curriculum.length ? table(['Subject','Units','Year / semester','Remark','Eligibility'], evaluation.curriculum.map(row => '<tr><td><strong>' + esc(row.code) + '</strong><small>' + esc(row.title) + '</small></td><td>' + esc(row.units) + '</td><td>' + esc(row.yearLevel) + ' / ' + esc(semesterLabel(row.semester)) + '</td><td>' + esc(remarkLabel(row.remark)) + '</td><td>' + (row.eligible ? 'Eligible' : esc((row.blockedReasons || []).join('; ') || 'Not eligible')) + '</td></tr>')) : empty('No curriculum entries', 'Add verified curriculum entries for this program.')) + planSummary(evaluation.plan) + '</section><div class="form-actions"><button class="button primary" data-page="assignments" data-student="' + esc(student.id) + '" type="button">Review subject assignment</button>' + (evaluation.failed.length ? '<button class="button" id="failed-subjects" type="button">Review failed subjects</button>' : '') + '<button class="button" data-action="retry-evaluation" type="button">Refresh evaluation</button></div>';
  if (!isRegistrar()) return html;
  if (locked) return html + '<div class="notice">Resolve the published enrollment before changing academic results.</div>';
  html += '<div class="evaluation-grid separated-panel"><section class="panel"><h2>Record a result</h2><p class="panel-note">Numeric grades determine Passed or Failed automatically. Use Not taken when no grade applies. Saving results clears the current back-subject choice and draft assignment.</p><form id="result-form" data-student="' + esc(student.id) + '"><div class="form-grid">' + inputField('Subject code *','result-code','name="code" required maxlength="20" autocomplete="off"') + '<div class="field"><label for="result-mode">Grade entry *</label><select id="result-mode" name="mode"><option value="raw">Raw grade (0–100)</option><option value="transmuted">Transmuted grade</option><option value="not_taken">Not taken</option></select></div>' + inputField('Raw grade *','result-raw','name="rawGrade" type="number" min="0" max="100" step="0.01" required') + '<div class="field"><label for="result-grade">Transmuted grade *</label><select id="result-grade" name="grade" disabled><option value="">Choose a grade</option>' + options(['1.00','1.25','1.50','1.75','2.00','2.25','2.50','2.75','3.00','5.00']) + '</select></div><div class="field"><label for="result-term">Result term *</label><select id="result-term" name="termId" required>' + (data.terms || []).map(term => '<option value="' + esc(term.id) + '" ' + (term.id === data.term?.id ? 'selected' : '') + '>' + esc(term.label) + '</option>').join('') + '</select></div></div><p id="grade-preview" class="field-help" aria-live="polite"></p><div class="form-actions"><button class="button primary" type="submit">Save academic result</button></div></form></section><section class="panel"><h2>Import academic results</h2><p class="panel-note">Upload up to 200 rows for this student. Headers: code, rawGrade or grade, remark, termId. Remarks: passed, failed, not_taken. Numeric grades set the remark automatically. Empty termId uses the active term. Quoted fields may contain commas, quotes, and line breaks.</p><p class="field-help">Review every row before saving. Existing results with the same subject code are replaced. Drafts and previews stay in memory until reload.</p><form id="result-upload-form" data-student="' + esc(student.id) + '"><div class="field"><label for="results-file">Academic results CSV *</label><input id="results-file" type="file" accept=".csv,text/csv" required></div><div class="form-actions"><button class="button" type="submit">Preview CSV</button></div></form></section></div><section id="csv-preview" class="separated-panel" aria-live="polite">' + csvPreviewHTML(student.id) + '</section>';
  return html;
}
function manualResult(form) {
  const fields = Object.fromEntries(new FormData(form));
  return { code: fields.code, termId: fields.termId, ...evaluateGrade(fields.mode === 'raw' ? { rawGrade: fields.rawGrade } : fields.mode === 'transmuted' ? { grade: fields.grade } : { remark: 'not_taken' }) };
}
function updateGradePreview() {
  const form = document.getElementById('result-form');
  if (!form) return;
  const mode = $('#result-mode').val();
  $('#result-raw').prop('disabled', mode !== 'raw').prop('required', mode === 'raw');
  $('#result-grade').prop('disabled', mode !== 'transmuted').prop('required', mode === 'transmuted');
  if ((mode === 'raw' && !$('#result-raw').val()) || (mode === 'transmuted' && !$('#result-grade').val())) { $('#grade-preview').removeClass('validation-text').text('Enter a grade to preview its conversion and result.'); return; }
  try { const row = manualResult(form); $('#grade-preview').removeClass('validation-text').text((row.rawGrade ? 'Raw ' + row.rawGrade + ' → ' : '') + (row.grade ? 'Transmuted ' + row.grade + ' · ' : '') + remarkLabel(row.remark)); }
  catch (error) { $('#grade-preview').addClass('validation-text').text(error.message); }
}
function validateResultRows(rows, evaluation) {
  const seen = new Set();
  return rows.map((input, index) => {
    const row = { ...input, code: String(input.code || '').trim().toUpperCase(), termId: input.termId || data.term?.id };
    try {
      if (!row.code || !evaluation.curriculum.some(subject => subject.code === row.code)) throw new Error('Choose a subject in this student’s curriculum.');
      if (seen.has(row.code)) throw new Error('Duplicate subject code in this import.');
      seen.add(row.code);
      if (!(data.terms || []).some(term => term.id === row.termId)) throw new Error('Choose an existing academic term.');
      return { ...row, ...evaluateGrade(row), line: index + 2 };
    } catch (error) { return { ...row, line: index + 2, error: error.message }; }
  });
}
function csvPreviewHTML(id) {
  const rows = resultPreviews.get(id);
  if (!rows?.length) return '';
  const invalid = rows.some(row => row.error);
  return '<div class="panel"><h2>CSV preview · ' + rows.length + ' results</h2><p class="panel-note">Student ' + esc(id) + '. ' + (invalid ? 'Correct the flagged rows in your file and upload it again.' : 'Review the converted grades, then save all results.') + '</p>' + table(['Row','Subject','Raw grade','Transmuted grade','Remark','Term','Validation'], rows.map(row => '<tr><td>' + row.line + '</td><td>' + esc(row.code) + '</td><td>' + esc(row.rawGrade || '—') + '</td><td>' + esc(row.grade || '—') + '</td><td>' + esc(row.error ? '—' : remarkLabel(row.remark)) + '</td><td>' + esc(row.termId) + '</td><td>' + (row.error ? '<span class="validation-text">' + esc(row.error) + '</span>' : 'Ready') + '</td></tr>')) + '<form id="result-import-form" data-student="' + esc(id) + '"><div class="form-actions"><button class="button primary" type="submit" ' + (invalid ? 'disabled' : '') + '>Save imported results</button><button class="button" id="discard-result-preview" type="button">Discard preview</button></div></form></div>';
}
async function saveResultRows(id, rows, form) {
  if (!isRegistrar()) throw new Error('Only the Registrar can record academic results.');
  const checked = validateResultRows(rows, evaluations.get(id));
  const invalid = checked.find(row => row.error);
  if (invalid) throw new Error(invalid.code + ': ' + invalid.error);
  await api('/students/' + encodeURIComponent(id) + '/results', 'POST', { rows: checked.map(({ code, rawGrade, grade, remark, termId }) => ({ code, rawGrade, grade, remark, termId })) });
  clearFormDraft(form); resultPreviews.delete(id); subjectDrafts.delete(id); sectionDrafts.delete(id);
  if (assignmentStudentId === id) { assignmentCodes = []; assignmentStudentId = ''; }
  if (draftStudentId === id) { draftSections = []; draftStudentId = ''; }
  for (const key of formDrafts.keys()) if (key.startsWith('assignments:' + id + ':') || key.startsWith('enroll:' + id + ':')) formDrafts.delete(key);
  await refreshData(); alertUser('Academic results saved. Subject eligibility has been recalculated.');
}
function resourcesPage() {
  const rows = data.resources || [];
  return heading('', 'Rooms & professors', 'Maintain the catalogs used when creating sections.') + noticeHTML() + '<div class="evaluation-grid">' + ['room','professor'].map(kind => '<section class="panel"><h2>' + (kind === 'room' ? 'Rooms' : 'Professors') + '</h2>' + (rows.some(row => row.kind === kind) ? table(kind === 'room' ? ['Room','Capacity'] : ['Professor'], rows.filter(row => row.kind === kind).map(row => '<tr><td>' + esc(row.name) + '</td>' + (kind === 'room' ? '<td>' + esc(row.capacity) + '</td>' : '') + '</tr>')) : empty(kind === 'room' ? 'No rooms yet' : 'No professors yet', 'Add an entry below to make it available for sections.')) + '</section>').join('') + '</div><section class="panel form-panel separated-panel"><h2>Add catalog entry</h2><form id="resource-form"><div class="form-grid"><div class="field"><label for="resource-kind">Entry type *</label><select id="resource-kind" name="kind"><option value="room">Room</option><option value="professor">Professor</option></select></div>' + inputField('Name *','resource-name','name="name" required maxlength="40"') + inputField('Room capacity *','resource-capacity','name="capacity" type="number" min="1" max="500" required') + '</div><div class="form-actions"><button class="button primary" type="submit">Add catalog entry</button><button class="button" data-page="section-new" type="button">Create section</button></div></form></section>';
}
function recoveryPage() {
  return heading('', 'Account recovery', 'Verify identity using the school-approved process before issuing a reset link.') + noticeHTML() + '<section class="panel form-panel"><h2>Issue a password reset link</h2><p class="panel-note">Use the existing account. Record the verification reason without entering identity documents or passwords.</p><form id="recovery-form"><div class="form-grid"><div class="field"><label for="recovery-role">Account role *</label><select id="recovery-role" name="role"><option value="student">Student</option><option value="department_head">Department Head</option></select></div>' + inputField('Student ID *','recovery-target','name="target" required pattern="[0-9]{2}-[0-9]{5}" autocomplete="off" placeholder="Search name or student ID"') + inputField('Verification reason *','recovery-reason','name="reason" required minlength="3" maxlength="240"') + '</div><label class="check-label" for="identity-verified"><input id="identity-verified" type="checkbox" required>I verified the account holder’s identity using the school-approved process.</label><div class="form-actions"><button class="button primary" type="submit">Generate reset link</button></div></form><div id="recovery-result" aria-live="polite">' + recoveryResultHTML() + '</div></section>';
}
function recoveryResultHTML() {
  if (!recoveryResult) return '';
  return '<div class="notice separated-panel"><strong>Reset link generated</strong><p>' + esc(recoveryResult.label) + ' · Expires ' + esc(new Date(recoveryResult.expiresAt).toLocaleString()) + '</p><div class="field"><label for="recovery-link">Copy this link for the verified account holder</label><input id="recovery-link" type="text" readonly value="' + esc(recoveryResult.url) + '"></div><button class="button" id="copy-recovery-link" type="button">Copy reset link</button><p class="field-help">Share this link only with the verified account holder.</p></div>';
}
function practicePage() {
  const origin = 'http://127.0.0.1:3004';
  return heading('', 'Practice enrollment', 'Open the practice application to work through enrollment.') + noticeHTML() + '<section class="panel"><div class="button-row"><a class="button primary" href="' + origin + '/staff.html" target="_blank" rel="noopener">Open practice staff workspace</a><a class="button" href="' + origin + '/student.html?view=login" target="_blank" rel="noopener">Open practice student portal</a><a class="button" href="' + origin + '/" target="_blank" rel="noopener">Open practice enrollment home</a></div><h2>Practice walkthrough</h2><ol class="workflow-explanation"><li><strong>Student:</strong> Sign in and choose or defer failed subjects.</li><li><strong>Department Head:</strong> Review individual evaluation and approve eligible subject assignments.</li><li><strong>Registrar:</strong> Select sections for the approved subjects and publish the schedule offer.</li><li><strong>Student:</strong> Review the offered schedule and accept it.</li><li><strong>Registrar:</strong> Confirm the accepted enrollment.</li></ol><p class="field-help">Sign out before switching staff roles. Refresh the student portal after each staff action.</p>' + (publicConfigError ? '<div class="notice error" role="alert">Unable to check practice access: ' + esc(publicConfigError) + '</div>' : publicConfig.practice === true ? '<div class="practice-note separated-panel">Practice mode is enabled for this application.</div>' + table(['Role','Practice password'], [['Registrar','PracticeRegistrar2026!'],['Department Head','PracticeHead2026!'],['Student','PracticeStudent2026!']].map(row => '<tr><td>' + row[0] + '</td><td>' + row[1] + '</td></tr>')) + '<h2>Practice students</h2><p>' + data.students.length + ' fictional students across ' + (data.blocks || []).length + ' permanent blocks.</p><p><a href="staff.html?view=blocks">Browse block rosters and timetables</a></p>' + (data.students.length ? table(['Student ID','Name'], data.students.filter(student => ['example.regular@example.test','example.irregular@example.test'].includes(student.email)).map(student => '<tr><td class="id-code">' + esc(student.id) + '</td><td>' + esc(fullName(student)) + '</td></tr>')) : empty('No practice student records', 'Register a student in the practice application.')) : '<p class="panel-note separated-panel">Open the practice application on port 3004. Practice credentials and student IDs are shown inside that application when practice mode is enabled.</p>') + '</section>';
}
$(document).on('click', '#sidebar-toggle', function () { const collapsed = $('body').toggleClass('sidebar-collapsed').hasClass('sidebar-collapsed'); this.setAttribute('aria-expanded', String(!collapsed)); });
$(document).on('click', '[data-action="retry-evaluation"]', function () { evaluations.delete(selectedStudentId); render(); });
$(document).on('input change', '#result-mode, #result-raw, #result-grade', updateGradePreview);
$(document).on('submit', '#result-form', function (event) { event.preventDefault(); submitWorkflow(this, async () => saveResultRows(this.dataset.student, [manualResult(this)], this)); });
$(document).on('submit', '#result-upload-form', function (event) {
  event.preventDefault();
  const id = this.dataset.student, file = this.querySelector('input[type="file"]').files[0];
  submitWorkflow(this, async () => {
    resultPreviews.delete(id); if (page === 'evaluation' && selectedStudentId === id) $('#csv-preview').empty();
    if (!file || file.size > 1024 * 1024) throw new Error('Choose a CSV file smaller than 1 MB.');
    const evaluation = evaluations.get(id), revision = viewRevision, text = await file.text();
    if (!auth.authenticated || revision !== viewRevision) return;
    const rows = validateResultRows(parseResultCSV(text), evaluation);
    resultPreviews.set(id, rows);
    if (page === 'evaluation' && selectedStudentId === id) $('#csv-preview').html(csvPreviewHTML(id));
    $('#status').text(rows.length + ' rows previewed. ' + rows.filter(row => row.error).length + ' rows need correction.');
  });
});
$(document).on('submit', '#result-import-form', function (event) {
  event.preventDefault(); submitWorkflow(this, async () => { const rows = resultPreviews.get(this.dataset.student); if (!rows?.length || rows.some(row => row.error)) throw new Error('Upload a valid CSV and review the preview first.'); await saveResultRows(this.dataset.student, rows, this); });
});
$(document).on('click', '#discard-result-preview', function () { resultPreviews.delete(selectedStudentId); $('#csv-preview').empty(); });
$(document).on('click', '#failed-subjects', function () {
  const evaluation = evaluations.get(selectedStudentId);
  if (!evaluation) return;
  $('#confirm-dialog').html('<p>Failed subjects for <strong>' + esc(evaluation.student.name) + '</strong> (' + esc(evaluation.student.id) + ')</p>' + resultTable(evaluation.failed.map(row => evaluation.results.find(result => result.code === row.code) || row)) + backChoiceNotice(evaluation)).dialog({ title: 'Review failed subjects', modal: true, resizable: false, width: Math.min(760, window.innerWidth - 30), maxHeight: window.innerHeight - 40, buttons: [{ text: 'Close', click() { $(this).dialog('close'); } }] });
});
$(document).on('click', '#print-evaluation', function () { if (!document.querySelector('.evaluation-report')) return; document.body.classList.add('print-evaluation'); try { window.print(); } finally { document.body.classList.remove('print-evaluation'); } });
window.addEventListener('afterprint', () => document.body.classList.remove('print-evaluation'));
$(document).on('change', '#resource-kind', function () { const room = this.value === 'room'; $('#resource-capacity').prop('disabled', !room).prop('required', room).closest('.field').prop('hidden', !room); $('#resource-name').attr('maxlength', room ? 40 : 100); });
$(document).on('submit', '#resource-form', function (event) { event.preventDefault(); submitWorkflow(this, async () => { if (!isRegistrar()) throw new Error('Registrar access is required.'); const fields = Object.fromEntries(new FormData(this)); await api('/resources', 'POST', { kind: fields.kind, name: fields.name, ...(fields.kind === 'room' ? { capacity: Number(fields.capacity) } : {}) }); clearFormDraft(this); await refreshData(); alertUser('Catalog entry added. It is available when creating sections.'); }); });
$(document).on('change', '#room', function () { const room = (data.resources || []).find(row => row.kind === 'room' && row.name === this.value); if (room?.capacity) $('#capacity').attr('max', room.capacity).val(Math.min(Number($('#capacity').val()) || room.capacity, room.capacity)); });
function updateRecoveryRole() {
  const head = $('#recovery-role').val() === 'department_head';
  $('#recovery-target').prop('disabled', head).prop('required', !head).closest('.field').prop('hidden', head);
  $('#identity-verified').prop('checked', false);
}
$(document).on('change', '#recovery-role', updateRecoveryRole);
$(document).on('input change', '#recovery-target, #recovery-reason', () => $('#identity-verified').prop('checked', false));
$(document).on('focus', '#assignment-subject, #result-code', function () { $(this).autocomplete('search', this.value); });
$(document).on('submit', '#recovery-form', function (event) {
  event.preventDefault();
  submitWorkflow(this, async () => {
    if (!isRegistrar()) throw new Error('Registrar access is required.');
    const fields = Object.fromEntries(new FormData(this));
    const target = fields.role === 'department_head' ? 'department_head' : fields.target.trim();
    if (!$('#identity-verified').prop('checked')) throw new Error('Verify the account holder’s identity first.');
    if (fields.role === 'student' && !studentById(target)) throw new Error('Select an existing student record.');
    recoveryResult = null; $('#recovery-result').empty();
    const result = await api('/recovery', 'POST', { role: fields.role, target, reason: fields.reason.trim(), identityVerified: true });
    const url = new URL(result.resetUrl, location.origin);
    if (url.origin !== location.origin || !result.resetUrl.startsWith('/')) throw new Error('The server returned an invalid reset link.');
    recoveryResult = { url: url.href, expiresAt: result.expiresAt, label: fields.role === 'department_head' ? 'Department Head' : target + ' · ' + fullName(studentById(target)) };
    clearFormDraft(this); $('#identity-verified').prop('checked', false); $('#recovery-result').html(recoveryResultHTML()); $('#status').text('Reset link generated for the verified account holder.');
  });
});
$(document).on('click', '#copy-recovery-link', async function () {
  try { if (!recoveryResult || Date.parse(recoveryResult.expiresAt) <= Date.now()) throw new Error('This reset link has expired. Verify identity again before generating a new link.'); await navigator.clipboard.writeText(recoveryResult.url); $('#status').text('Reset link copied.'); this.textContent = 'Copied'; }
  catch (error) { $('#recovery-link').trigger('focus').trigger('select'); $('#status').text(error.message + ' Select and copy the link manually if it is still valid.'); }
});

const shortProgram = name => plpPrograms.find(row=>row.name===name)?.code || name;
const blockTitle = block => `${shortProgram(block.program)} ${block.groupCode} · ${block.cohortYear} intake`;
function blockMembershipNotice(student) {
  if (!student) return '<p id="block-readiness" class="field-help">Select a student to check their registration and status before assigning a block.</p>';
  if (!student.reviewedAt) return `<div id="block-readiness" class="notice" role="status"><strong>${esc(fullName(student))} is awaiting Registrar review.</strong><p>Check the student’s details and classification, then confirm registration before assigning a block.</p><button class="button small" data-action="student-detail" data-id="${esc(student.id)}" type="button">Review student record</button></div>`;
  if (student.status!=='Active') return `<div id="block-readiness" class="notice" role="status"><strong>${esc(fullName(student))} is inactive.</strong><p>Review the student’s record and set the status to Active before assigning a block.</p><button class="button small" data-action="student-edit" data-id="${esc(student.id)}" type="button">Edit student record</button></div>`;
  return '<p id="block-readiness" class="field-help">Registration reviewed · Active student</p>';
}
function blocksPage() {
  const blocks=data.blocks || [],block=blocks.find(row=>row.id===selectedBlockId);
  if (!block) return heading('','Permanent blocks','Block groups stay with students from 1st through 4th year.')+noticeHTML()+
    `<section class="panel">${blocks.length ? table(['Block','Intake','Members','Capacity','Active-term schedule',''],blocks.map(row=>{const term=(data.blockTerms || []).find(term=>term.blockId===row.id);return `<tr><td><strong>${esc(shortProgram(row.program))} ${esc(row.groupCode)}</strong></td><td>${row.cohortYear}</td><td>${row.members}</td><td>${row.capacity}</td><td>${term ? esc(term.label)+' · '+term.classes.length+'/'+term.subjects.length+' classes' : 'Not prepared'}</td><td><button class="text-button" type="button" data-open-block="${row.id}">Manage block</button></td></tr>`;})) : empty('No blocks yet','Create a permanent group, then prepare its schedule for the active term.')}</section>
    <details class="panel separated-panel"><summary>Create permanent block</summary><form id="block-form"><div class="form-grid">${selectField('Program *','block-program',programs())}${inputField('Block letter *','block-group','name="groupCode" required pattern="[A-Za-z]{1,3}" maxlength="3" placeholder="A"')}${inputField('Intake year *','block-cohort','name="cohortYear" required type="number" min="2000" max="2099" value="'+new Date().getFullYear()+'"')}${inputField('Membership capacity *','block-capacity','name="capacity" required type="number" min="1" max="500" value="40"')}</div><div class="form-actions"><button class="button primary" type="submit">Create block</button></div></form></details>`;
  const term=(data.blockTerms || []).find(row=>row.blockId===block.id),members=data.students.filter(row=>row.homeBlock?.id===block.id),student=studentById(selectedStudentId);
  const sources=[...new Set((data.curriculum || []).filter(row=>row.program===block.program).map(row=>row.source))];
  const required=term?.subjects || [],unscheduled=required.filter(row=>!term.classes.some(section=>section.code===row.code));
  const resourceSelect=(label,id,kind,name)=>`<div class="field"><label for="${id}">${label} *</label><select id="${id}" name="${name}" required><option value="">Choose ${esc(label.toLowerCase())}</option>${(data.resources || []).filter(row=>row.kind===kind).map(row=>`<option value="${esc(row.name)}">${esc(row.name)}${kind==='room'?' · '+row.capacity+' seats':''}</option>`).join('')}</select></div>`;
  const timetable=term ? `<h2>${esc(term.label)} · ${esc(termLabel())}</h2><p class="panel-note">Curriculum: ${esc(term.source || 'Staff entries')} · ${term.classes.length} of ${required.length} classes scheduled.</p>${table(['Subject','Units','Prerequisites','Scheduled class'],required.map(row=>{const entry=term.classes.find(item=>item.code===row.code),section=entry && sectionById(entry.sectionId);return `<tr><td><strong>${esc(row.code)}</strong><small>${esc(row.title)}</small></td><td>${row.units}</td><td>${esc(prerequisiteLabel(row))}</td><td>${section ? esc(section.day)+' · '+esc(timeRange(section))+`<small>${esc(section.room)} · ${esc(section.instructor)}</small>` : 'Not scheduled'}</td></tr>`;}))}${unscheduled.length ? `<details class="separated-panel" open><summary>Schedule a curriculum subject</summary><form id="block-class-form" data-term="${term.id}"><div class="form-grid"><div class="field full"><label for="block-class-code">Subject *</label><select id="block-class-code" name="code" required>${unscheduled.map(row=>`<option value="${esc(row.code)}">${esc(row.code)} · ${esc(row.title)}</option>`).join('')}</select></div>${resourceSelect('Professor','block-professor','professor','instructor')}${resourceSelect('Room','block-room','room','room')}${selectField('Day *','block-day',['Monday','Tuesday','Wednesday','Thursday','Friday'])}${inputField('Class capacity *','block-class-capacity','name="capacity" type="number" min="1" max="'+block.capacity+'" value="'+block.capacity+'" required')}${inputField('Start time *','block-start','name="start" type="time" required value="08:00"')}${inputField('End time *','block-end','name="end" type="time" required value="09:00"')}</div><p class="field-help">The curriculum supplies the subject and prerequisites. Meetings cannot overlap within this block or conflict with a room or professor.</p><div class="form-actions"><button class="button primary" type="submit">Add class to block</button></div></form></details>` : '<p class="notice">The block timetable is complete. Review each student’s evaluation before publishing their offer.</p>'}` : `<h2>Prepare this term’s schedule</h2><form id="block-term-form" data-block="${block.id}"><div class="form-grid">${selectField('Year level *','block-year',[1,2,3,4],Math.min(4,Math.max(1,Number(data.term.id.split('-')[0])-block.cohortYear+1)))}<div class="field"><label for="block-source">Curriculum *</label><select id="block-source" name="source">${sources.map(source=>`<option value="${esc(source)}" ${source==='2022–2023'?'selected':''}>${esc(source || 'Staff entries')}</option>`).join('')}</select></div></div><div class="form-actions"><button class="button primary" type="submit">Prepare curriculum subjects</button></div></form>`;
  const history=(data.blockTransfers || []).filter(row=>row.fromBlockId===block.id || row.toBlockId===block.id);
  return heading('',blockTitle(block),'Only the Registrar can assign or transfer permanent block membership.',`<button class="button" data-open-block="0" type="button">All blocks</button>`)+noticeHTML()+`<div id="block-tabs"><ul><li><a href="#block-timetable">Timetable</a></li><li><a href="#block-roster">Students (${members.length})</a></li><li><a href="#block-history">Transfer history</a></li></ul><section id="block-timetable">${timetable}</section><section id="block-roster"><h2>Home block roster</h2><p>${members.length} of ${block.capacity} membership places used. Year-level changes retain this group.</p>${members.length ? table(['Student','ID','Year','Classification',''],members.map(row=>`<tr><td>${esc(fullName(row))}</td><td>${esc(row.id)}</td><td>${esc(row.level)}</td><td>${esc(types[row.studentType])}</td><td><button class="text-button" data-page="enroll" data-student="${esc(row.id)}" type="button">Review offer</button></td></tr>`)) : empty('No students assigned','Assign a reviewed student below.')}<h3>Assign or transfer a student here</h3>${blockMembershipNotice(student)}<form id="block-member-form" data-block="${block.id}"><div class="form-grid"><div class="field"><label for="block-student">Find student *</label><input id="block-student" name="studentId" required autocomplete="off" value="${esc(student?.id || '')}"><span class="field-help">${student ? esc(fullName(student))+' · Current block: '+esc(student.homeBlock?.label || 'Not assigned') : 'Search by name or student ID.'}</span></div>${inputField('Transfer reason','block-reason','name="reason" maxlength="240" '+(student?.homeBlock && student.homeBlock.id!==block.id?'required':''))}</div><div class="form-actions"><button class="button primary" type="submit" ${student?.homeBlock?.id===block.id?'disabled':''}>${student?.homeBlock?'Transfer to this block':'Assign initial block'}</button></div></form></section><section id="block-history"><h2>Membership history</h2>${history.length ? table(['Student ID','From','To','Reason','Registrar','Date'],history.map(row=>`<tr>${[row.studentId,blocks.find(block=>block.id===row.fromBlockId)?.groupCode || 'Not assigned',blocks.find(block=>block.id===row.toBlockId)?.groupCode,row.reason,row.actor,row.at].map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`)) : empty('No changes yet','Initial assignments and Registrar transfers will appear here.')}</section></div>`;
}
function initializeBlockWidgets() {
  $('#block-tabs').tabs({active:blockTab,heightStyle:'content',activate:(_event,ui)=>{blockTab=ui.newTab.index();}});
  $('#block-student').autocomplete({minLength:1,source:data.students.map(row=>({label:fullName(row)+' ('+row.id+')',value:row.id})),select:(_event,ui)=>{selectedStudentId=ui.item.value;setTimeout(render,0);return false;}});
}
function regularBlockOffer(student) {
  const home=student.homeBlock,term=(data.blockTerms || []).find(row=>row.blockId===home?.id && row.yearLevel===parseInt(student.level));
  const passed=(data.completed || []).filter(row=>row.studentId===student.id).map(row=>row.code);
  const required=(term?.subjects || []).filter(row=>!passed.includes(row.code)),classes=required.map(row=>sectionById(term.classes.find(item=>item.code===row.code)?.sectionId)).filter(Boolean);
  const complete=term && required.length>0 && classes.length===required.length;
  return heading('','Block schedule offer','Publish the student’s applicable home-block classes together.')+noticeHTML()+studentPicker('offer-student',student)+`<section class="panel"><h2>${esc(fullName(student))}</h2><p>${esc(student.id)} · ${esc(home?.label || 'Home block not assigned')}</p>${!home?'<p>Assign the student’s permanent block before preparing their offer.</p>':!term?'<p>Prepare the home block schedule for this year level and active term.</p>':table(['Subject','Block','Meeting','Room','Professor'],classes.map(row=>`<tr>${[row.code,row.blockLabel || row.section,row.day+' '+timeRange(row),row.room,row.instructor].map(value=>`<td>${esc(value)}</td>`).join('')}</tr>`))}${term && !complete?'<div class="notice">Some applicable curriculum subjects still need a scheduled class.</div>':''}<p class="field-help">Passed subjects are omitted. Prerequisites, standing, available seats and conflicts are checked before publishing. The student still accepts or declines the complete offer.</p><div class="form-actions"><button class="button primary" id="publish-block-offer" data-term="${term?.id || ''}" data-student="${esc(student.id)}" type="button" ${!complete || !student.reviewedAt || student.status!=='Active'?'disabled':''}>Review and publish block offer</button><button class="button" data-open-block="${home?.id || 0}" type="button">Manage block</button><button class="button" data-page="evaluation" data-student="${esc(student.id)}" type="button">Individual evaluation</button></div></section>`;
}
$(document).on('click','[data-open-block]',function(){selectedBlockId=Number(this.dataset.openBlock);blockTab=0;page='blocks';render();$('#main').trigger('focus');});
$(document).on('change','#block-room',function(){const room=(data.resources || []).find(row=>row.kind==='room' && row.name===this.value);if(room) $('#block-class-capacity').attr('max',Math.min(room.capacity,(data.blocks || []).find(row=>row.id===selectedBlockId)?.capacity || 500)).val(Math.min(Number($('#block-class-capacity').val()),room.capacity));});
$(document).on('submit','#block-form',function(event){event.preventDefault();submitWorkflow(this,async()=>{const fields=Object.fromEntries(new FormData(this));fields.program=$('#block-program').val();const block=await api('/blocks','POST',fields);clearFormDraft(this);selectedBlockId=block.id;await refreshData();alertUser('Permanent block created.');});});
$(document).on('submit','#block-term-form',function(event){event.preventDefault();submitWorkflow(this,async()=>{await api('/block-terms','POST',{blockId:Number(this.dataset.block),yearLevel:Number($('#block-year').val()),source:$('#block-source').val()});clearFormDraft(this);await refreshData();alertUser('Curriculum subjects loaded. Add their scheduled classes.');});});
$(document).on('submit','#block-class-form',function(event){event.preventDefault();submitWorkflow(this,async()=>{const fields=Object.fromEntries(new FormData(this));fields.day=$('#block-day').val();await api('/block-terms/'+this.dataset.term+'/classes','POST',fields);clearFormDraft(this);await refreshData();alertUser('Class added to the block timetable.');});});
$(document).on('submit','#block-member-form',function(event){
  event.preventDefault();const form=this,fields=Object.fromEntries(new FormData(form)),student=studentById(fields.studentId),block=(data.blocks || []).find(row=>row.id===Number(form.dataset.block));
  if(!student || !block){alertUser('Select an existing student and block.','error');return;}
  $('#confirm-dialog').html(`<p>${student.homeBlock?'Transfer':'Assign'} <strong>${esc(fullName(student))}</strong> (${esc(student.id)}) ${student.homeBlock?'from '+esc(student.homeBlock.label):''} to <strong>${esc(blockTitle(block))}</strong>?</p><p>${esc(fields.reason || 'Initial block assignment')}</p>`).dialog({title:'Confirm permanent block',modal:true,width:Math.min(560,window.innerWidth-24),buttons:[{text:'Cancel',click(){$(this).dialog('close');}},{text:'Confirm block',async click(){const dialog=$(this);dialog.parent().find('button').prop('disabled',true);try{await api('/students/'+encodeURIComponent(student.id)+'/block','POST',{blockId:block.id,reason:fields.reason});clearFormDraft(form);await refreshData();dialog.dialog('close');alertUser('Permanent block membership saved.');}catch(error){dialog.dialog('close');alertUser(error.message,'error');}finally{dialog.parent().find('button').prop('disabled',false);}}}]});
});
$(document).on('click','#publish-block-offer',function(){const id=this.dataset.student,term=this.dataset.term;$('#confirm-dialog').html(`<p>Publish the home-block schedule for <strong>${esc(fullName(studentById(id)))}</strong> (${esc(id)})?</p><p>This reserves a seat in every applicable class while the student decides.</p>`).dialog({title:'Publish block offer',modal:true,width:Math.min(540,window.innerWidth-24),buttons:[{text:'Cancel',click(){$(this).dialog('close');}},{text:'Publish offer',async click(){const dialog=$(this);dialog.parent().find('button').prop('disabled',true);try{await api('/blocks/offer','POST',{studentId:id,blockTermId:Number(term)});await refreshData();dialog.dialog('close');alertUser('Block schedule offered. Waiting for the student’s response.');}catch(error){dialog.dialog('close');alertUser(error.message,'error');}finally{dialog.parent().find('button').prop('disabled',false);}}}]});});

render();
bootstrap();




