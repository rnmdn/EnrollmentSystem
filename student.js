import $ from 'jquery';
import '@fontsource-variable/outfit';
import '@fontsource-variable/newsreader';
import 'jquery-ui-dist/jquery-ui.css';
import './styles.css';
import './ui-refresh.css';
window.jQuery = window.$ = $;
await import('jquery-ui-dist/jquery-ui.js');

const content = $('#student-content');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const field = (label, name, type = 'text', extra = '') => `<div class="field"><label for="${name}">${label} *</label><input id="${name}" name="${name}" type="${type}" ${extra} required></div>`;
const notice = (message, error = false) => `<div class="notice ${error ? 'error' : ''}" role="alert">${esc(message)}</div>`;
const story = (title, description) => `<aside class="student-story"><div class="story-mark" aria-hidden="true"></div><h1>${esc(title)}</h1><p>${esc(description)}</p><ol class="student-steps"><li><strong>Register</strong><span>Enter your student details once.</span></li><li><strong>Registrar review</strong><span>Your record is checked before enrollment.</span></li><li><strong>View schedule</strong><span>Return to see confirmed subjects and times.</span></li></ol></aside>`;

async function api(path, payload) {
  const response = await fetch(`/api/public/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-registrar-request': '1' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

function registration() {
  content.html(`<div class="student-layout">${story('Your enrollment starts here.', 'A clear first step toward your next academic term. Complete your information, then let the registrar handle the section checks.')}<section class="panel form-panel"><div class="panel-head"><div><h2>Student information</h2><p class="panel-note">Fields marked * are required. Your student ID is created after you submit.</p></div></div><form id="registration-form"><div class="form-grid">
    ${field('First name', 'first', 'text', 'maxlength="60" autocomplete="given-name"')}
    ${field('Last name', 'last', 'text', 'maxlength="60" autocomplete="family-name"')}
    ${field('Birth date', 'birth', 'text', 'placeholder="MM/DD/YYYY"')}
    <div class="field"><label for="gender">Gender *</label><select id="gender" name="gender" required><option value="">Choose</option><option>Female</option><option>Male</option><option>Nonbinary</option><option>Prefer not to say</option></select></div>
    ${field('Address', 'address', 'text', 'maxlength="240" autocomplete="street-address"')}
    ${field('Contact number', 'phone', 'tel', 'maxlength="40" autocomplete="tel"')}
    ${field('Email address', 'email', 'email', 'maxlength="120" autocomplete="email"')}
    <div class="field"><label for="program">Program / course *</label><select id="program" name="program" required><option value="">Choose a program</option>${['BS Computer Science','BS Information Technology','BS Business Administration','BS Accountancy','BA Communication'].map(value => `<option>${esc(value)}</option>`).join('')}</select></div>
    <div class="field"><label for="level">Year level *</label><select id="level" name="level" required>${['1st year','2nd year','3rd year','4th year'].map(value => `<option>${esc(value)}</option>`).join('')}</select></div>
    ${field('Admission date', 'admitted', 'text', 'placeholder="MM/DD/YYYY"')}
    </div><div class="form-actions"><button class="button primary" type="submit">Submit registration</button><button class="button" id="show-status" type="button">Check existing registration</button></div></form></section></div>`);
  $('#birth, #admitted').datepicker({ dateFormat: 'mm/dd/yy', changeMonth: true, changeYear: true, yearRange: '1950:+0', maxDate: 0 });
}

function statusForm(message = '') {
  content.html(`<div class="student-layout">${story('See what comes next.', 'Return with your student ID to check your registration and the sections confirmed for this term.')}<section class="panel form-panel"><div class="panel-head"><div><h2>Check registration</h2><p class="panel-note">Use the same email and birth date you entered earlier.</p></div></div>${message ? notice(message) : ''}<form id="status-form"><div class="form-grid">${field('Student ID', 'student-id', 'text', 'placeholder="YY-00001"')}${field('Email address', 'status-email', 'email')}${field('Birth date', 'status-birth', 'text', 'placeholder="MM/DD/YYYY"')}</div><div class="form-actions"><button class="button primary" type="submit">View registration and schedule</button><button class="button" id="show-registration" type="button">Start registration</button></div></form></section></div>`);
  $('#status-birth').datepicker({ dateFormat: 'mm/dd/yy', changeMonth: true, changeYear: true, yearRange: '1950:+0', maxDate: 0 });
}

function showStatus(data) {
  content.html(`<div class="page-heading"><div><h1>${esc(data.name)}</h1><p class="subtitle">Student ID <strong>${esc(data.id)}</strong> · ${esc(data.term)}</p></div></div>${notice(data.reviewed ? 'Registration confirmed by the registrar.' : 'Registration saved. Awaiting registrar review.')}
    <section class="panel"><div class="panel-head"><div><h2>Assigned subjects and schedule</h2><p class="panel-note">Confirmed section assignments for the active term</p></div></div>${data.classes.length ? `<div class="table-wrap"><table class="data-table"><thead><tr><th>Subject</th><th>Section</th><th>Day</th><th>Time</th><th>Room</th><th>Instructor</th></tr></thead><tbody>${data.classes.map(item => `<tr><td>${esc(item.code)} · ${esc(item.title)}</td><td>${esc(item.section)}</td><td>${esc(item.day)}</td><td>${esc(item.start)}–${esc(item.end)}</td><td>${esc(item.room)}</td><td>${esc(item.instructor)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No subjects assigned yet. Check again after the registrar confirms your enrollment.</div>'}</section><div class="form-actions"><button class="button" id="show-status" type="button">Check again</button></div>`);
}

$(document).on('click', '#show-status', () => statusForm());
$(document).on('click', '#show-registration', registration);
$(document).on('submit', '#registration-form', async function (event) {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(this));
  try {
    const result = await api('register', { ...fields, status: 'Active' });
    statusForm(result.existing ? `Existing student record found: ${result.id}.` : `Registration saved. Your permanent student ID is ${result.id}.`);
    $('#student-id').val(result.id);
    $('#status-email').val(fields.email);
    $('#status-birth').val(fields.birth);
  } catch (error) { $(this).before(notice(error.message, true)); }
});
$(document).on('submit', '#status-form', async function (event) {
  event.preventDefault();
  const fields = Object.fromEntries(new FormData(this));
  try { showStatus(await api('student', { id: fields['student-id'], email: fields['status-email'], birth: fields['status-birth'] })); }
  catch (error) { $(this).before(notice(error.message, true)); }
});

registration();
