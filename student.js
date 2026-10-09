import $ from 'jquery';
import '@fontsource-variable/outfit';
import '@fontsource-variable/newsreader';
import 'jquery-ui-dist/jquery-ui.css';
import './styles.css';
window.jQuery = window.$ = $;
await import('jquery-ui-dist/jquery-ui.js');

const content = $('#student-content');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const field = (label, name, type = 'text', extra = '') => `<div class="field"><label for="${name}">${label} *</label><input id="${name}" name="${name}" type="${type}" ${extra} required></div>`;
const notice = (message, error = false) => `<div class="notice ${error ? 'error' : ''}" role="alert">${esc(message)}</div>`;

async function api(path, payload) {
  const response = await fetch(`/api/public/${path}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-registrar-request': '1' }, body: JSON.stringify(payload) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'The request could not be completed.');
  return data;
}

function registration() {
  content.html(`<div class="page-heading"><div><h1>Start registration</h1><p class="subtitle">Enter your information. The registrar will review your record before section enrollment.</p></div></div><section class="panel form-panel"><div class="panel-head"><div><h2>Student information</h2><p class="panel-note">Fields marked * are required.</p></div></div><form id="registration-form"><div class="form-grid">
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
    </div><div class="form-actions"><button class="button primary" type="submit">Submit registration</button><button class="button" id="show-status" type="button">Check existing registration</button></div></form></section>`);
  $('#birth, #admitted').datepicker({ dateFormat: 'mm/dd/yy', changeMonth: true, changeYear: true, yearRange: '1950:+0', maxDate: 0 });
}

function statusForm(message = '') {
  content.html(`<div class="page-heading"><div><h1>Check registration</h1><p class="subtitle">Use the student ID and details entered during registration.</p></div></div>${message ? notice(message) : ''}<section class="panel form-panel"><form id="status-form"><div class="form-grid">${field('Student ID', 'student-id', 'text', 'placeholder="YY-00001"')}${field('Email address', 'status-email', 'email')}${field('Birth date', 'status-birth', 'text', 'placeholder="MM/DD/YYYY"')}</div><div class="form-actions"><button class="button primary" type="submit">View registration and schedule</button><button class="button" id="show-registration" type="button">Start registration</button></div></form></section>`);
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
