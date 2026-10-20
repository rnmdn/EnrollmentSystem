import $ from 'jquery';
import '@fontsource-variable/outfit';
import '@fontsource-variable/newsreader';
import 'jquery-ui-dist/jquery-ui.css';
import './styles.css';
import './ui-refresh.css';
import './plp.css';
import './student-school.css';
import './navigation.css';
import { institution, programs } from './institution.js';
window.jQuery = window.$ = $;
let resetToken = new URLSearchParams(location.hash.slice(1)).get('token') || '';
if (new URLSearchParams(location.hash.slice(1)).has('token')) {
  const cleanUrl = new URL(location.href);
  cleanUrl.hash = '';
  history.replaceState(history.state, '', cleanUrl);
}
await import('jquery-ui-dist/jquery-ui.js');

const content = $('#student-content');
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const field = (label, name, type = 'text', extra = '') => {
  const help = name === 'admitted' ? 'Defaults to today in Manila. Use MM/DD/YYYY.' : /birth/.test(name) ? 'Use MM/DD/YYYY.' : '';
  return `<div class="field"><label for="${name}">${label} *</label><input id="${name}" name="${name}" type="${type}" ${extra} ${help ? `aria-describedby="${name}-help"` : ''} required>${help ? `<span class="field-help" id="${name}-help">${help}</span>` : ''}</div>`;
};
const notice = (message, error = false) => `<div class="notice ${error ? 'error' : ''}" role="alert">${esc(message)}</div>`;
const story = (title, description, extra = '') => `<div class="student-story"><h1>${esc(title)}</h1><p>${esc(description)}</p>${extra}</div>`;

let session = null;
let me = null;
let lookup = null;
let screenRevision = 0;
let config = { institution, programs, term: null, practice: false };
let configAvailable = false;
let navigatingHistory = false;
let registrationDraft = {};
let registrationResult = null;
let registrationSubmitting = false;
let backSubjectDraft = null;
const backSubjectPrompts = new Set();
const draftFields = ['first', 'last', 'birth', 'gender', 'address', 'phone', 'email', 'program', 'level', 'studentType'];
const passwordHelp = '<span class="field-help">Use at least 8 characters and at most 72 UTF-8 bytes. Accented characters and emoji may use more than one byte.</span>';
const typeOptions = { regular: 'Regular', back_subject: 'Back subject', transferee: 'Transferee', returning: 'Returning', academic_recovery: 'Academic recovery', accessible_learning: 'Accessible learning' };
const typeHelp = {
  regular: 'Following the subjects prescribed for your year and semester.',
  back_subject: 'Taking one or more subjects from an earlier year or semester.',
  transferee: 'Previously studied at another institution.',
  returning: 'Resuming study at PLP after a break.',
  academic_recovery: 'Choose only if the school has placed you under Academic Recovery.',
  accessible_learning: 'Choose only if the school has confirmed your Accessible Learning classification.'
};
const statusLabels = { unassigned: 'Awaiting schedule', draft: 'Schedule in preparation', pending: 'Awaiting your response', accepted: 'Awaiting confirmation', declined: 'Offer declined', confirmed: 'Enrollment confirmed' };

function manilaToday() {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = type => parts.find(part => part.type === type).value;
  return `${value('month')}/${value('day')}/${value('year')}`;
}
function saveRegistrationDraft() {
  const form = document.getElementById('registration-form');
  if (!form) return;
  registrationDraft = Object.fromEntries(draftFields.map(name => [name, form.elements[name]?.value || '']));
}
function hasRegistrationDraft() { return draftFields.some(name => !['level', 'studentType'].includes(name) && Boolean(registrationDraft[name])); }
window.addEventListener('beforeunload', event => {
  if ((hasRegistrationDraft() && !registrationSubmitting) || backSubjectDraft?.dirty) { event.preventDefault(); event.returnValue = ''; }
});
function updateTypeHelp() { $('#student-type-help').text(typeHelp[$('#studentType').val()] || 'Ask the Registrar which classification applies.'); }
function lastUpdated(value, label = 'Last enrollment update') {
  if (!value) return '';
  const date = new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(date.getTime())) return '';
  const formatted = new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', dateStyle: 'medium', timeStyle: 'short' }).format(date);
  return `<p class="update-time">${esc(label)}: <time datetime="${esc(date.toISOString())}">${esc(formatted)} (Manila)</time></p>`;
}
function nextStep(status, reviewed, updatedAt, back = null, plan = null) {
  const instructions = {
    unassigned: reviewed ? ['School staff', 'The school will prepare your subjects and schedule. No response is needed from you yet.'] : ['Registrar', 'The Registrar must review your registration before preparing an offer. No response is needed from you yet.'],
    draft: ['School staff', 'The school is preparing your subjects and schedule. Return to this portal to check for an offer.'],
    pending: ['You', 'Review every subject and meeting time below. Accept or decline the complete offer.'],
    accepted: ['Registrar', 'You have accepted your schedule. No further response is needed while the Registrar confirms enrollment.'],
    declined: ['School staff', 'Your seats have been released. Contact the Registrar to discuss the changes needed for a new offer.'],
    confirmed: ['You', 'Keep a copy of your confirmed schedule. Ask the Registrar if any details need correction.']
  };
  if (back?.failed?.length && ['unassigned', 'draft', 'declined'].includes(status)) {
    instructions[status] = !back.reviewed ? ['Registrar', 'The Registrar must review your record before you save a retake choice.']
      : !back.choice ? ['You', 'Review your failed subjects. Choose requested retakes or defer all this term.']
      : plan?.status === 'draft' && plan.subjects?.length ? ['Registrar', 'Subjects have been assigned. The Registrar will prepare your schedule offer.']
      : ['Department Head', 'Your retake choice is saved. The Department Head reviews it and assigns subjects, then the Registrar prepares your schedule offer.'];
  }
  const [owner, message] = instructions[status] || instructions.unassigned;
  return `<section class="next-step" aria-label="Next enrollment step"><h3>What happens next</h3><p><strong>Next action: ${esc(owner)}.</strong> ${esc(message)}</p>${lastUpdated(updatedAt)}<a href="/student.html?view=help" data-student-view="help">Need help or waiting for an update?</a></section>`;
}
function setRoute(view, replace = false) {
  if (!navigatingHistory) {
    const url = new URL(location.href);
    if (view) url.searchParams.set('view', view); else url.searchParams.delete('view');
    if (url.href !== location.href) history[replace ? 'replaceState' : 'pushState'](null, '', url);
  }
  content.attr('data-view', view || 'dashboard');
  const names = {grades:'My grades',register:'Registration',login:'Student sign in',status:'Registration status',account:'First password',help:'Help & recovery',receipt:'Registration receipt',success:'Registration receipt',reset:'Reset password'};
  document.title = `${names[view] || 'My enrollment'} | PLP Enrollment`;
  $('#student-location').remove();
  const trail = $('<nav id="student-location" class="student-location" aria-label="Breadcrumb"></nav>');
  trail.append($('<a href="/">Enrollment home</a>'), $('<span aria-current="page"></span>').text(names[view] || 'My enrollment'));
  content.before(trail);
  $('.student-nav [data-student-view], .student-help-link').each(function () {
    if (this.dataset.studentView === view) this.setAttribute('aria-current', 'page'); else this.removeAttribute('aria-current');
  });
}
function updateHeader() {
  $('#student-institution-name').text(config.institution.name);
  if (config.practice) $('#student-institution-name').append(' <span class="student-practice-label">Practice</span>');
  $('#student-active-term').text(config.term?.label || me?.term || (configAvailable ? 'No active term set' : 'Term information unavailable'));
  $('#student-official-link').attr('href', config.institution.website).prop('hidden', !config.institution.website);
  $('#student-nav').prop('hidden', Boolean(session));
  $('.student-staff-link').text(session && session.role !== 'student' ? 'Staff workspace' : 'Staff sign in');
}
function clearFieldError(input) {
  input.removeAttribute('aria-invalid');
  document.getElementById(`${input.id}-error`)?.remove();
  const ids = (input.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== `${input.id}-error`);
  if (ids.length) input.setAttribute('aria-describedby', ids.join(' ')); else input.removeAttribute('aria-describedby');
}
function fieldError(input, message) {
  if (!input) return;
  clearFieldError(input);
  input.setAttribute('aria-invalid', 'true');
  const error = document.createElement('span');
  error.id = `${input.id}-error`; error.className = 'field-error'; error.textContent = message;
  (input.closest('.field') || input.parentElement).append(error);
  input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), error.id].filter(Boolean).join(' '));
}
function renderValidationSummary(form) {
  if (!form?.isConnected) return;
  $(form).find('.validation-summary').remove();
  const invalid = [...form.querySelectorAll('[aria-invalid="true"]')];
  if (!invalid.length) return;
  $(form).prepend(`<div class="validation-summary" role="region" aria-label="Fields needing attention"><h3>Check ${invalid.length} field${invalid.length === 1 ? '' : 's'}</h3><ul>${invalid.map(input => `<li><a href="#${esc(input.id)}" data-error-field="${esc(input.id)}">${esc(input.labels?.[0]?.textContent.replace(/\s*\*\s*$/, '').trim() || 'Field')}: ${esc(document.getElementById(`${input.id}-error`)?.textContent || 'Check this value.')}</a></li>`).join('')}</ul></div>`);
}
function validateForm(form) {
  $(form).find('[aria-invalid="true"]').each((_index, input) => clearFieldError(input));
  const [todayMonth, todayDay, todayYear] = manilaToday().split('/').map(Number);
  for (const input of form.querySelectorAll('[data-date]')) {
    const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(input.value.trim());
    const date = match && new Date(Number(match[3]), Number(match[1]) - 1, Number(match[2]));
    if (!match || date.getFullYear() !== Number(match[3]) || date.getMonth() !== Number(match[1]) - 1 || date.getDate() !== Number(match[2]) || date > new Date(todayYear, todayMonth - 1, todayDay)) fieldError(input, 'Enter a valid date as MM/DD/YYYY, on or before today in Manila.');
  }
  const programInput = form.querySelector('#program');
  if (programInput && config.programs.length) {
    const selected = config.programs.find(program => program.name.toLowerCase() === programInput.value.trim().toLowerCase());
    if (selected) programInput.value = selected.name; else fieldError(programInput, 'Choose a PLP program from the search results. Search by name or code.');
  }
  const password = form.querySelector('input[type="password"]:not(:disabled)');
  const confirmation = form.querySelector('[data-password-confirm]:not(:disabled)');
  if (confirmation && password) {
    if (password.value.length < 8 || new TextEncoder().encode(password.value).length > 72) fieldError(password, 'Use at least 8 characters and at most 72 UTF-8 bytes.');
    if (password.value !== confirmation.value) fieldError(confirmation, 'The passwords do not match. Enter the same password in both fields.');
  }
  const invalid = form.querySelector('[aria-invalid="true"]');
  if (invalid) { renderValidationSummary(form); invalid.focus(); $('#student-status').text('Check the marked fields. Your entries have been kept.'); return false; }
  return true;
}
async function api(path, payload) {
  const response = await fetch(`/api${path}`, { method: payload === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', 'x-registrar-request': '1' }, body: payload === undefined ? undefined : JSON.stringify(payload) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || 'The request could not be completed. Please try again.'), { status: response.status });
  return result;
}
function showError(error, form) {
  if (form && !form.isConnected) return;
  content.find('.notice.error').remove();
  const message = notice(error.message, true);
  if (form?.isConnected) {
    $(form).prepend(message);
    const mappings = [[/birth date/i, '[data-date]:not(#admitted)'], [/admission date|registration date/i, '#admitted'], [/email/i, 'input[type="email"]'], [/program/i, '#program'], [/password/i, 'input[type="password"]'], [/first name/i, '#first'], [/last name/i, '#last'], [/contact number/i, '#phone'], [/address/i, '#address'], [/privacy consent/i, '#privacy-consent']];
    const match = mappings.find(([pattern]) => pattern.test(error.message));
    if (match) fieldError(form.querySelector(match[1]), error.message);
    $(form).find('.notice.error')[0]?.scrollIntoView({ block: 'nearest' });
  } else content.prepend(message);
  $('#student-status').text(error.message);
  if (form?.id === 'registration-form' && /active term|Registration is unavailable/i.test(error.message)) $(form).find('.notice.error').append(' <button class="text-action" id="retry-registration" type="button">Review the current term</button>');
}
async function submit(form, operation) {
  if (form.dataset.busy || !validateForm(form)) return;
  const revision = screenRevision;
  if (form.id === 'registration-form') registrationSubmitting = true;
  form.dataset.busy = 'true'; $(form).attr('aria-busy','true');
  const button = $(form).find('[type="submit"]').prop('disabled',true);
  const label = button.text(); button.text('Please wait…');
  content.find('.notice.error').remove();
  try { await operation(() => revision === screenRevision); } catch(error) { if (revision === screenRevision) showError(error, form); }
  finally { if (form.id === 'registration-form') registrationSubmitting = false; delete form.dataset.busy; $(form).removeAttr('aria-busy'); button.prop('disabled',false).text(label); }
}
function dates(selector) {
  const [month, day, year] = manilaToday().split('/').map(Number);
  $(selector).attr('data-date', '').datepicker({ dateFormat: 'mm/dd/yy', changeMonth: true, changeYear: true, yearRange: '1900:+0', maxDate: new Date(year, month - 1, day), onSelect() { clearFieldError(this); $(this).trigger('change'); } });
}
function showScreen(html) {
  screenRevision++;
  if ($('#student-dialog').hasClass('ui-dialog-content')) $('#student-dialog').dialog('close');
  $('#student-status').text('');
  content.find('.hasDatepicker').datepicker('hide');
  content.html(html); updateHeader(); content.trigger('focus');
}

function registration() {
  setRoute('register');
  showScreen(`<div class="student-layout student-registration">${story('Student registration', 'Create your student record and receive a permanent student ID. No account needed.', '<p class="registration-returning">Already registered? <a href="/student.html?view=status" data-student-view="status">Check your registration status</a>.</p>')}<section class="panel form-panel" aria-labelledby="registration-heading"><h2 id="registration-heading" class="sr-only">Registration details</h2><p class="required-note">Fields marked * are required.</p><form id="registration-form"><fieldset class="student-fieldset"><legend>Personal information</legend><div class="form-grid">
    ${field('First name', 'first', 'text', 'maxlength="60" autocomplete="given-name"')}
    ${field('Last name', 'last', 'text', 'maxlength="60" autocomplete="family-name"')}
    ${field('Birth date', 'birth', 'text', 'placeholder="MM/DD/YYYY"')}
    <div class="field"><label for="gender">Gender *</label><select id="gender" name="gender" required><option value="">Choose</option><option>Female</option><option>Male</option><option>Nonbinary</option><option>Prefer not to say</option></select></div>
    <div class="field full"><label for="address">Address *</label><input id="address" name="address" maxlength="240" autocomplete="street-address" required></div>
    ${field('Contact number', 'phone', 'tel', 'maxlength="40" autocomplete="tel"')}
    ${field('Email address', 'email', 'email', 'maxlength="120" autocomplete="email"')}
    </div></fieldset><fieldset class="student-fieldset"><legend>Academic information</legend><div class="form-grid">
    <div class="field full"><label for="program">Program / course *</label><input id="program" name="program" required maxlength="100" autocomplete="off" placeholder="Search by program name or code" aria-describedby="program-help"><span class="field-help" id="program-help">Search by name or code. Use the arrow keys and Enter to select.</span></div>
    <div class="field"><label for="level">Year level *</label><select id="level" name="level" required>${['1st year','2nd year','3rd year','4th year'].map(value => `<option>${esc(value)}</option>`).join('')}</select></div>

    <div class="field"><span class="field-label">Enrollment term</span><strong id="registration-term">${esc(config.term?.label || 'No active term available')}</strong><input type="hidden" name="semester" value="${Number(config.term?.id?.split('-')[1] || 1)}"><input type="hidden" name="termId" value="${esc(config.term?.id || '')}"><span class="field-help">The school sets the active term. Your submission date is recorded automatically.</span></div>
    <div class="field"><label for="studentType">Registration type *</label><select id="studentType" name="studentType" aria-describedby="student-type-help" required>${Object.entries(typeOptions).map(([value,label]) => `<option value="${value}">${label}</option>`).join('')}</select><span class="field-help" id="student-type-help"></span></div>
    </div><p class="student-section-note type-guidance">The Registrar verifies your classification. If more than one type applies or you are unsure, <a href="/student.html?view=help" data-student-view="help">ask for classification help</a> before choosing.</p></fieldset><fieldset class="student-fieldset student-privacy"><legend>Privacy notice</legend>
    <p class="student-section-note">Your details are used to maintain your student record, review registration, and prepare your enrollment schedule. Authorized staff can access these details. Contact the Registrar to request a correction.</p>
    <div class="field"><label class="check-label" for="privacy-consent"><input id="privacy-consent" name="consent" type="checkbox" required><span>I consent to the use of my details for student records, registration review and enrollment. *</span></label></div>
    </fieldset><div class="form-actions"><button class="button primary" type="submit">Submit registration</button><button class="text-action" id="clear-registration" type="button">Clear form</button></div></form></section></div>`);
  const choices = config.programs.map(program => ({ label: `${program.code} — ${program.name}`, value: program.name, search: `${program.code} ${program.name} ${program.college || ''}` }));
  $('#program').autocomplete({ minLength: 0, delay: 0,
    source(request, response) { response(choices.filter(choice => choice.search.toLowerCase().includes(request.term.trim().toLowerCase()))); },
    select(_event, ui) { this.value = ui.item.value; clearFieldError(this); $(this).trigger('change'); },
    change() { if (this.value && choices.length && !choices.some(choice => choice.value.toLowerCase() === this.value.trim().toLowerCase())) fieldError(this, 'Choose a PLP program from the search results.'); }
  }).on('focus', function () { $(this).autocomplete('search', this.value); });
  if (!choices.length) $('#program-help').text('The program list is unavailable. Enter your program as recorded and ask the registrar to verify it.');
  dates('#birth');
  for (const [name, value] of Object.entries(registrationDraft)) {
    const input = document.querySelector(`#registration-form [name="${name}"]`);
    if (input && draftFields.includes(name)) input.value = value;
  }
  if (!Object.hasOwn(registrationDraft, 'program')) {
    const code = (new URL(location.href).searchParams.get('program') || '').toUpperCase();
    const selected = config.programs.find(program => program.code === code);
    if (selected) {
      $('#program').val(selected.name);
      $('#program-help').text('Selected from the college programs. You can search for a different program.');
    }
  }
  updateTypeHelp();
  if (hasRegistrationDraft()) $('.required-note').after('<p class="draft-restored" role="status">Your unfinished details are restored. Confirm consent before submitting.</p>');
  if (!configAvailable || !config.term) {
    $('#registration-form [type="submit"]').prop('disabled', true);
    $('#registration-form').prepend('<div class="notice error" role="alert">Registration is unavailable until the active term can be checked. Your entries will be kept while this page stays open. <button class="text-action" id="retry-registration" type="button">Check the active term again</button></div>');
  }
}

function registrationSuccess() {
  setRoute('success');
  if (!registrationResult) {
    showScreen(`<section class="panel form-panel registration-success"><h1>Already registered?</h1><p>Your registration receipt is no longer available in this tab. Your saved student record has not been removed.</p><p>Use your existing Student ID to check registration or set up your first password. Do not register again to recover your ID.</p><div class="form-actions"><button class="button primary" id="show-status" type="button">Check registration</button><button class="button" id="show-account" type="button">Set up first password</button></div><p><a href="/student.html?view=help" data-student-view="help">Need your Student ID or password recovery?</a></p></section>`);
    return;
  }
  const { id, existing, hasAccount } = registrationResult;
  showScreen(`<section class="registration-success" aria-labelledby="registration-success-heading"><h1 id="registration-success-heading">${existing ? 'Your existing record was found' : 'Registration received'}</h1><p class="success-intro">${existing ? 'Keep using your permanent Student ID. A second student record has not been created.' : 'Your student record is saved. Keep your permanent Student ID for this and future terms.'}</p><div class="registration-receipt"><label for="registered-student-id">Your permanent Student ID</label><div class="receipt-id-row"><input id="registered-student-id" class="receipt-id" readonly value="${esc(id)}" aria-describedby="receipt-id-help"><button class="button" id="copy-student-id" type="button">Copy Student ID</button></div><p id="receipt-id-help">This ID stays the same across terms. Save it somewhere you can find it again.</p><p class="copy-feedback" id="copy-id-feedback" role="status" aria-live="polite"></p></div><h2>${existing ? 'Continue with your existing record' : hasAccount ? 'Your password is set' : 'Set up your first password when you’re ready'}</h2><p>${existing ? 'Sign in if you already have a password. If you have never set one, use first-password setup. Check registration to see whether your record has been reviewed.' : hasAccount ? 'Sign in to check for schedule offers from the school.' : 'You’ll need a password to view and accept or decline schedule offers. You can set it up now or return later with this Student ID, your registered email and birth date.'}</p><div class="form-actions">${existing ? '<button class="button primary" id="show-status" type="button">Check registration</button><button class="button" id="show-login" type="button">Student sign in</button>' : hasAccount ? '<button class="button primary" id="show-login" type="button">Student sign in</button><button class="button" id="show-status" type="button">Check registration</button>' : '<button class="button primary" id="show-account" type="button">Set up first password</button><button class="button" id="show-status" type="button">Skip for now · check registration</button>'}</div>${existing ? '<p><button class="text-action" id="show-account" type="button">I have never set a password</button></p>' : ''}<p class="receipt-review-note">${existing ? 'Registration review does not confirm enrollment.' : 'Next: the Registrar reviews your details. Registration received does not mean enrollment is confirmed.'}</p><a href="/student.html?view=help" data-student-view="help">Need help with your Student ID or password?</a></section>`);
}

function statusForm(message = '') {
  setRoute('status');
  showScreen(`<div class="student-layout">${story('Check registration', 'See whether the Registrar has reviewed your record. Sign in to view your schedule offer.')}<section class="panel form-panel"><div class="panel-head"><div><h2>Registration details</h2><p class="panel-note">Use the details you registered with.</p></div></div>${message ? notice(message) : ''}<form id="status-form"><div class="form-grid">${field('Student ID','student-id','text','placeholder="YY-00001" pattern="[0-9]{2}-[0-9]{5}"')}${field('Email address','status-email','email','autocomplete="email"')}${field('Birth date','status-birth','text','placeholder="MM/DD/YYYY"')}</div><div class="form-actions"><button class="button primary" type="submit">Check registration status</button><button class="button" id="show-registration" type="button">Start registration</button></div></form></section></div>`);
  dates('#status-birth');
  if (lookup) { $('#student-id').val(lookup.id); $('#status-email').val(lookup.email); $('#status-birth').val(lookup.birth); }
}
function showStatus(result) {
  setRoute('status');
  showScreen(`<div class="page-heading"><div><h1>Registration status</h1><p class="subtitle">Student ID <strong class="id-code">${esc(result.id)}</strong> · ${esc(result.term)}${result.homeBlock ? ` · Home block <strong>${esc(result.homeBlock.label)}</strong>` : ''}</p></div></div>${notice(result.reviewed ? 'Registration reviewed by the Registrar.' : 'Registration saved. Awaiting Registrar review.')}${lastUpdated(result.updatedAt, 'Last registration update')}<section class="next-step" aria-label="Next registration step"><h2>What happens next</h2><p>${result.reviewed ? 'Sign in to check your schedule and enrollment status. Registration review alone does not confirm enrollment.' : 'The Registrar must review your details. No further response is needed from you until a schedule offer is ready.'}</p><a href="/student.html?view=help" data-student-view="help">Need help with your record or processing status?</a></section><section class="panel form-panel"><h2>${result.hasAccount ? 'Your student account is ready' : 'Set up your first password'}</h2><p>${result.hasAccount ? 'Sign in to view your schedule offer and respond.' : 'Set up your first password to view and respond to schedule offers. If you have used a password before, use Help &amp; recovery.'}</p><div class="form-actions">${result.hasAccount ? '<button class="button primary" id="show-login" type="button">Student sign in</button>' : '<button class="button primary" id="show-account" type="button">Set up first password</button>'}<button class="button" id="show-status" type="button">Check another registration</button></div></section>`);
}
function loginForm(message = '') {
  setRoute('login');
  showScreen(`<div class="student-layout">${story('Student sign in', 'View your schedule and accept or decline your enrollment offer.')}<section class="panel form-panel"><h2>Your account</h2>${message ? notice(message) : ''}<form id="login-form"><div class="form-grid">${field('Student ID','login-id','text','placeholder="YY-00001" pattern="[0-9]{2}-[0-9]{5}" autocomplete="username"')}${field('Password','login-password','password','minlength="8" maxlength="128" autocomplete="current-password"')}</div><div class="form-actions"><button class="button primary" type="submit">Sign in</button></div><p class="account-help">Never set a password? <button class="text-action" id="show-account" type="button">Set up your first password</button></p><p class="account-help"><a href="/student.html?view=status" data-student-view="status">Check registration status without signing in</a></p><p class="account-help"><a href="/student.html?view=help" data-student-view="help">Forgot your password or student ID?</a></p></form></section></div>`);
  if (lookup) $('#login-id').val(lookup.id);
}
function accountForm() {
  setRoute('account');
  showScreen(`<div class="page-heading"><div><h1>Set up first password</h1><p class="subtitle">For registered students who have never created a password. <a href="/student.html?view=help" data-student-view="help">Already have a password or need your student ID?</a></p></div></div><section class="panel form-panel"><form id="account-form"><div class="form-grid">${field('Student ID','account-id','text','placeholder="YY-00001" pattern="[0-9]{2}-[0-9]{5}"')}${field('Email address','account-email','email','autocomplete="email"')}${field('Birth date','account-birth','text','placeholder="MM/DD/YYYY"')}${field('New password','account-password','password','minlength="8" maxlength="72" autocomplete="new-password"')}${field('Confirm password','account-password-confirm','password','minlength="8" maxlength="72" autocomplete="new-password"')}<div class="field full">${passwordHelp}</div></div><div class="form-actions"><button class="button primary" type="submit">Set up password</button><button class="button" id="show-login" type="button">Sign in</button></div></form></section>`);
  $('#account-password-confirm').attr('data-password-confirm', '');
  dates('#account-birth');
  if (lookup) $('#account-id').val(lookup.id);
}
function helpForm() {
  setRoute('help');
  showScreen(`<div class="page-heading"><div><h1>Help &amp; account recovery</h1><p class="subtitle">Keep your existing registration. You do not need a second student ID.</p></div></div><div class="student-help-sections"><section><h2>Forgot your password?</h2><p>Ask the Registrar to verify your identity and arrange recovery. Setting up a first password will not replace an existing password.</p><p>After verifying your identity, the Registrar can provide a password reset link. Open that link to choose a new password, then sign in. Do not share your password or reset link.</p></section><section><h2>Lost your student ID?</h2><p>Ask the Registrar to find your existing record. Have your registered name and email ready, and follow the school's identity-verification instructions. Do not submit another registration to obtain a new ID.</p></section><section><h2>Which registration type applies?</h2><dl class="classification-help">${Object.entries(typeHelp).map(([key, description]) => `<div><dt>${esc(typeOptions[key])}</dt><dd>${esc(description)}</dd></div>`).join('')}</dl><p>If several types apply, ask the Registrar which classification to use. Staff must confirm it before assigning subjects.</p></section><section><h2>Waiting for review or confirmation?</h2><p>Use <a href="/student.html?view=status" data-student-view="status">Check registration</a> for registration review. Sign in for schedule offers and enrollment confirmation. Use Refresh in your student portal to request the latest status.</p><p>If you need processing guidance or a correction, contact the Registrar. Ask the Registrar about processing times and offer deadlines.</p></section><section><h2>Where to get help</h2><p>Contact the Registrar for help with registration details, Student IDs and account access.</p><a class="button" href="${esc(config.institution.registrarUrl || institution.registrarUrl)}" target="_blank" rel="noopener noreferrer">Open official Registrar information</a></section><div class="form-actions">${session?.role === 'student' ? '<button class="button primary" id="refresh-student" type="button">Return to my enrollment</button>' : '<button class="button primary" id="show-login" type="button">Student sign in</button><button class="text-action" id="show-registration" type="button">Return to registration</button>'}</div></div>`);
}
function resetForm() {
  setRoute('reset');
  showScreen(`<div class="student-layout">${story('Reset password', 'Use the reset link provided by the Registrar after your identity has been verified.')}<section class="panel form-panel"><h2>Choose a new password</h2>${resetToken ? `<form id="reset-password-form"><div class="form-grid">${field('New password', 'reset-password', 'password', 'minlength="8" autocomplete="new-password"')}${field('Confirm password', 'reset-password-confirm', 'password', 'minlength="8" autocomplete="new-password" data-password-confirm')}<div class="field full">${passwordHelp}</div></div><div class="form-actions"><button class="button primary" type="submit">Reset password</button></div></form><p class="field-help">Keep this page open. The reset link is held only while this page remains open.</p>` : notice('No reset link is available on this page. Ask the Registrar to verify your identity and provide a reset link.', true)}<p><a href="/student.html?view=help" data-student-view="help">Account recovery help</a></p></section></div>`);
}
function canChooseBackSubjects(result) {
  return !result.plan || result.plan.status === 'declined' || (result.plan.status === 'draft' && Array.isArray(result.plan.subjects) && result.plan.subjects.length === 0);
}
function blockedSubjectNotice(back) {
  return back?.blocked?.length ? `<div class="notice"><h3>Subjects you cannot take yet</h3><p>Pass the failed prerequisite before these subjects can be assigned this term.</p><ul>${back.blocked.map(row=>`<li><strong>${esc(row.code)} · ${esc(row.title)}</strong><br>Blocked by failed prerequisite: ${esc(row.failedPrerequisites.join(', '))}</li>`).join('')}</ul></div>` : '';
}
function backSubjectPanel(result) {
  const back = result.backSubjects;
  if (!back?.failed?.length) return '';
  const editable = back.reviewed && canChooseBackSubjects(result);
  const choice = back.choice;
  return `<section class="back-subject-review" aria-labelledby="back-subject-heading"><h2 id="back-subject-heading">Review your back subjects</h2>${blockedSubjectNotice(back)}<p role="alert">Your record has ${back.failed.length} failed subject${back.failed.length === 1 ? '' : 's'}. ${choice ? 'Your retake choice is saved.' : 'Choose which failed subjects to request for retake, or defer all this term.'}</p>${choice ? `<p>${choice.codes.length ? `Requested retakes: <strong>${esc(choice.codes.join(', '))}</strong>. Other failed subjects are deferred.` : 'You chose to defer all failed subjects this term.'}</p>${lastUpdated(choice.updatedAt, 'Retake choice updated')}` : ''}<p>${back.reviewed ? '' : 'The Registrar must review your registration. '}The Department Head reviews your choice and assigns subjects. The Registrar then prepares your schedule offer for you to accept or decline.</p><p>${editable ? 'You can revise your choice until subjects are assigned. Only failed subjects can be requested here.' : back.reviewed ? 'Subjects have been assigned; your choice is read-only. Contact the Registrar if a correction is needed.' : 'You can save your retake choice after the Registrar reviews your record.'}</p><button class="button ${editable && !choice ? 'primary' : ''}" id="review-back-subjects" type="button">${editable ? choice ? 'Revise retake choice' : 'Review retake choices' : 'View back subjects'}</button><p class="field-help">Unfinished choices stay in this page’s memory during navigation and do not survive reload.</p></section>`;
}
function reviewBackSubjects() {
  if (session?.role !== 'student' || !me?.backSubjects?.failed?.length) return;
  const record = me;
  const back = record.backSubjects;
  const editable = back.reviewed && canChooseBackSubjects(record);
  if (!editable || !backSubjectDraft || backSubjectDraft.id !== record.id || !backSubjectDraft.dirty) {
    backSubjectDraft = { id: record.id, codes: [...(back.choice?.codes || [])], dirty: false };
  }
  const dialog = $('#student-dialog');
  document.getElementById('review-back-subjects')?.focus({preventScroll:true});
  dialog.html(`<form id="back-subject-form">${blockedSubjectNotice(back)}<p id="retake-instructions">Select failed subjects to request for retake. Leave every subject unchecked to defer all this term. The Department Head assigns subjects; the Registrar prepares your schedule. Closing this dialog saves no choice. Use the action below to submit retakes or explicitly defer all.</p><fieldset class="retake-options" ${editable ? '' : 'disabled'} aria-describedby="retake-instructions"><legend>Failed subjects on your record</legend>${back.failed.map((row, index) => `<label class="retake-option" for="retake-${index}"><input type="checkbox" id="retake-${index}" name="codes" value="${esc(row.code)}" ${backSubjectDraft.codes.includes(row.code) ? 'checked' : ''}><span><strong>${esc(row.code)} · ${esc(row.title)}</strong><span class="retake-grade">Raw grade: ${esc(row.rawGrade || 'Not recorded')} · Transmuted grade: ${esc(row.grade || 'Not recorded')}${['passed', 'failed', 'not_taken'].includes(row.remark) ? ` · Remark: ${esc({ passed: 'Passed', failed: 'Failed', not_taken: 'Not taken' }[row.remark])}` : ''}</span></span></label>`).join('')}</fieldset><p id="retake-selection-summary" role="status"></p>${editable ? '<div class="form-actions"><button class="button primary" type="submit">Save retake choice</button></div>' : `<p>${back.reviewed ? 'Your choice is read-only after subject assignment.' : 'Wait for the Registrar to review your record before saving a choice.'}</p>`}</form>`).dialog({
    title: editable ? 'Choose retakes or defer' : 'Back subjects', modal: true, resizable: false, draggable: false,
    classes: {'ui-dialog':'retake-dialog'},
    width: Math.min(620, window.innerWidth - 24), maxHeight: window.innerHeight - 40,
    open() { const intro=this.querySelector('h3') || this.querySelector('#retake-instructions'); intro?.setAttribute('tabindex','-1'); intro?.focus({preventScroll:true}); this.scrollTop=0; },
    buttons: [{ text: 'Close', click() { $(this).dialog('close'); } }],
    beforeClose() { return !document.getElementById('back-subject-form')?.dataset.busy; },
  });
  function updateSelection(changed = false) {
    const codes = dialog.find('[name="codes"]:checked').map((_index, input) => input.value).get();
    if (changed) {
      const saved = back.choice?.codes || [];
      backSubjectDraft = { id: record.id, codes, dirty: codes.length !== saved.length || codes.some(code => !saved.includes(code)) };
    }
    dialog.find('#retake-selection-summary').text(codes.length ? `${codes.length} retake${codes.length === 1 ? '' : 's'} requested. Unchecked subjects will be deferred.` : 'All failed subjects will be deferred this term.');
    dialog.find('[type="submit"]').text(codes.length ? 'Request selected retakes' : 'Defer all this term');
  }
  updateSelection();
  dialog.find('[name="codes"]').on('change', () => updateSelection(true));
  dialog.find('form').on('submit', async function (event) {
    event.preventDefault();
    if (!editable || this.dataset.busy) return;
    this.dataset.busy = 'true';
    const form = $(this).attr('aria-busy', 'true');
    form.find('.notice.error').remove();
    const codes = form.find('[name="codes"]:checked').map((_index, input) => input.value).get();
    dialog.parent().find('button, input').prop('disabled', true);
    try {
      await api('/me/back-subjects', { codes });
      backSubjectDraft = null;
      delete this.dataset.busy;
      dialog.dialog('close');
      await refreshStudent();
      $('#student-status').text('Retake choice saved. The Department Head reviews and assigns subjects before the Registrar prepares your schedule.');
    } catch (error) {
      form.prepend(notice(error.message, true));
      form.find('.notice.error').attr('tabindex', '-1').trigger('focus');
    } finally {
      delete this.dataset.busy;
      form.removeAttr('aria-busy');
      dialog.parent().find('button, input').prop('disabled', false);
    }
  });
}
function promptBackSubjects(result) {
  const back = result.backSubjects;
  if (session?.role !== 'student' || !back?.reviewed || !back.failed?.length || back.choice || !canChooseBackSubjects(result)) return;
  const key = `plp:back-subject-review:${result.id}`;
  if (backSubjectPrompts.has(key)) return;
  try { if (sessionStorage.getItem(key)) return; } catch { /* Memory still prevents repeated prompts when storage is unavailable. */ }
  backSubjectPrompts.add(key);
  try { sessionStorage.setItem(key, 'shown'); } catch { /* The current page session uses the memory marker. */ }
  reviewBackSubjects();
}
function scheduleTable(classes) {
  return `<div class="table-wrap offer-table" role="region" aria-label="Complete subject and meeting list" tabindex="0"><table class="data-table"><thead><tr>${['Subject','Units','Section','Day','Time','Room','Instructor','Dates'].map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${classes.map(c => `<tr><td><strong>${esc(c.code)}</strong><small>${esc(c.title)}</small></td>${[c.units ?? 'Not recorded',c.section,c.day,`${meetingTime(c.start)} – ${meetingTime(c.end)}`,c.room,c.instructor,[c.startDate,c.endDate].filter(Boolean).join(' – ') || 'Not specified'].map(v => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div><ul class="mobile-schedule" aria-label="Complete subject and meeting list">${classes.map(c => `<li><h3>${esc(c.code)} · ${esc(c.title)}</h3><p class="subject-units">${esc(c.units ?? 'Not recorded')} units · Section ${esc(c.section)}</p><dl><div><dt>Meeting</dt><dd>${esc(c.day)}<br>${esc(meetingTime(c.start))} – ${esc(meetingTime(c.end))}</dd></div><div><dt>Room</dt><dd>${esc(c.room)}</dd></div><div><dt>Instructor</dt><dd>${esc(c.instructor)}</dd></div><div><dt>Dates</dt><dd>${esc([c.startDate,c.endDate].filter(Boolean).join(' – ') || 'Not specified')}</dd></div></dl></li>`).join('')}</ul>`;
}
function meetingTime(value) {
  const [hour, minute] = String(value || '').split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return 'Time not recorded';
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`;
}
function gradeRows(rows) {
  const labels = { passed: 'Passed', failed: 'Failed', not_taken: 'Not taken' };
  return `<ul class="grade-list">${rows.map(row => `<li class="grade-row"><div class="grade-subject"><strong>${esc(row.code)}</strong><span>${esc(row.title)}</span>${row.recordedTerm ? `<small>Recorded term: ${esc(row.recordedTerm)}</small>` : ''}</div><dl><div><dt>Units</dt><dd>${esc(row.units)}</dd></div><div><dt>Raw grade</dt><dd>${row.rawGrade ? `${esc(row.rawGrade)}%` : '<span aria-label="Not recorded">—</span>'}</dd></div><div><dt>Grade</dt><dd>${row.grade ? esc(row.grade) : '<span aria-label="Not recorded">—</span>'}</dd></div><div><dt>Remark</dt><dd><span class="grade-remark ${row.remark === 'failed' ? 'grade-failed' : ''}">${esc(labels[row.remark] || 'Not taken')}</span></dd></div></dl></li>`).join('')}</ul>`;
}
function renderGrades(result) {
  const years = [1, 2, 3, 4];
  const yearNames = ['1st year', '2nd year', '3rd year', '4th year'];
  const subjects = result.subjects;
  showScreen(`<div class="page-heading"><div><h1>My grades</h1><p class="subtitle">${esc(result.name)} · <strong>${esc(result.id)}</strong><br>${esc(result.program)}</p></div><div class="button-row"><a class="button" href="/student.html" data-student-view="dashboard">My enrollment</a><button class="button" id="refresh-grades" type="button">Refresh grades</button><button class="button" id="student-logout" type="button">Sign out</button></div></div><p class="grade-explanation">View your recorded results by curriculum year and semester. Contact the Registrar if a result needs correction.</p><details class="grade-key"><summary>How to read these results</summary><p>A dash means no numeric grade is recorded. Not taken means no evaluated result is recorded. A legacy completion may show Passed without a numeric grade. This page shows current results; it is not an official transcript or a history of retake attempts.</p></details><div class="grade-controls"><label for="grade-year">Year level</label><select id="grade-year"><option value="all">All years</option>${years.map((year, i) => `<option value="${year}">${yearNames[i]}</option>`).join('')}</select><p id="grade-count" role="status">${subjects.length} curriculum subjects</p></div>${subjects.length ? years.map((year, i) => `<section class="grade-year" data-grade-year="${year}" aria-labelledby="grade-year-${year}"><h2 id="grade-year-${year}">${yearNames[i]}</h2>${[1, 2, 3].filter(semester => subjects.some(row => row.yearLevel === year && row.semester === semester)).map(semester => {
    const rows = subjects.filter(row => row.yearLevel === year && row.semester === semester);
    const sources = [...new Set(rows.map(row => row.source).filter(Boolean))];
    return `<section class="panel grade-semester" aria-labelledby="grade-semester-${year}-${semester}"><h3 id="grade-semester-${year}-${semester}">${semester === 3 ? 'Summer' : `Semester ${semester}`}</h3>${sources.length ? `<p class="field-help">Curriculum: ${esc(sources.join(', '))}</p>` : ''}${gradeRows(rows)}</section>`;
  }).join('') || '<p class="empty">No curriculum subjects recorded for this year.</p>'}</section>`).join('') : '<section class="panel"><h2>Curriculum not available</h2><p>The subject list for your program has not been loaded yet. Any existing results are shown below. Contact the Registrar for your complete evaluation.</p></section>'}${result.otherResults.length ? `<section class="panel grade-other"><h2>Other recorded subjects</h2><p>These results are not listed in your current program curriculum.</p>${gradeRows(result.otherResults)}</section>` : ''}`);
  $('#grade-year').on('change', function () {
    const year = this.value;
    $('[data-grade-year]').each(function () { this.hidden = year !== 'all' && this.dataset.gradeYear !== year; });
    $('#grade-count').text(`${subjects.filter(row => year === 'all' || row.yearLevel === Number(year)).length} curriculum subjects`);
  });
}
async function openGrades() {
  setRoute('grades');
  showScreen('<section class="panel"><h1>My grades</h1><p role="status">Loading your results…</p><a class="button" href="/student.html" data-student-view="dashboard">My enrollment</a></section>');
  const revision = screenRevision;
  try {
    const result = await api('/me/grades');
    if (revision === screenRevision) renderGrades(result);
  } catch (error) {
    if (revision !== screenRevision) return;
    if (error.status === 401) { session = null; me = null; loginForm('Your session has ended. Sign in to view your grades.'); }
    else {
      showScreen('<section class="panel"><h1>My grades</h1><div class="button-row"><button class="button" id="refresh-grades" type="button">Try again</button><a class="button" href="/student.html" data-student-view="dashboard">My enrollment</a></div></section>');
      showError(error);
    }
  }
}
$(document).on('click', '#refresh-grades', openGrades);
function dashboard(result) {
  me = result;
  setRoute(null, true);
  const plan = result.plan;
  const status = plan?.status || 'unassigned';
  const explanations = { unassigned: result.homeBlock ? 'Your home block is assigned. The Registrar must complete and publish your schedule offer before it appears here.' : 'Your registration is on record. The Registrar has not published a schedule offer yet.', draft: 'The school is preparing your subject assignment. A schedule will appear when an offer is published.', pending: 'Review every subject and meeting below, then accept or decline the complete offer. Seats are reserved while you decide.', accepted: 'You accepted this offer. Your seats remain reserved while the registrar completes confirmation.', declined: 'You declined this offer. Reserved seats have been released. The school must prepare a new offer.', confirmed: 'Your enrollment is confirmed. Your reserved seats and schedule are shown below.' };
  const week = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
  const classes = (['pending','accepted','confirmed'].includes(status) ? result.classes || [] : []).slice().sort((a,b) => week.indexOf(a.day) - week.indexOf(b.day) || a.start.localeCompare(b.start));
  const unitsKnown = classes.every(c => Number.isFinite(Number(c.units)) && Number(c.units) > 0);
  const units = classes.reduce((sum, c) => sum + Number(c.units || 0), 0);
  const progress = ['Registration received', 'School review', 'Your response', 'Registrar confirmation'];
  const currentStep = status === 'confirmed' ? 4 : status === 'accepted' ? 3 : status === 'pending' ? 2 : 1;
  const days = [...new Set(['Monday','Tuesday','Wednesday','Thursday','Friday', ...classes.map(c => c.day)])];
  showScreen(`<div class="page-heading"><div><h1>${esc(result.name)}</h1><p class="subtitle">Student ID <strong class="id-code">${esc(result.id)}</strong> · ${esc(result.term)}</p>${result.homeBlock ? `<p class="subtitle">Home block <strong>${esc(result.homeBlock.label)}</strong></p>` : ''}</div><div class="button-row"><button class="button" id="refresh-student" type="button">Refresh status</button>${status === 'confirmed' ? '<button class="button primary" id="print-confirmation" type="button">Print confirmation</button>' : ''}<button class="button" id="student-logout" type="button">Sign out</button></div></div><div class="print-heading"><strong>${esc(config.institution.name)}</strong><span>Enrollment confirmation</span></div><nav class="student-page-links" aria-label="On this page"><a href="#enrollment-offer">Status &amp; offer</a>${classes.length ? '<a href="#weekly-timetable">Weekly timetable</a>' : ''}<a href="#enrollment-history">Enrollment history</a></nav><ol class="enrollment-progress" aria-label="Enrollment progress">${progress.map((label, index) => `<li class="${index < currentStep ? 'complete' : index === currentStep ? 'current' : ''}" ${index === currentStep ? 'aria-current="step"' : ''}>${esc(label)}${index < currentStep ? '<span class="sr-only"> — completed</span>' : ''}</li>`).join('')}</ol>${backSubjectPanel(result)}${nextStep(status, result.reviewed, result.updatedAt, result.backSubjects, plan)}<section class="panel current-enrollment" id="enrollment-offer" tabindex="-1"><div class="panel-head"><div><h2>${status === 'confirmed' ? 'Confirmed schedule' : ['pending','accepted','declined'].includes(status) ? 'Enrollment offer' : 'Enrollment status'}</h2><p class="panel-note">${esc(statusLabels[status] || status)}${plan ? ` · Offer version ${esc(plan.revision)}` : ''}</p></div></div><p class="workflow-explanation">${esc(explanations[status] || 'Refresh to see your latest enrollment status.')}</p>${plan?.subjects?.length ? `<p>Assigned subjects: <strong>${esc(plan.subjects.join(', '))}</strong></p>` : ''}${classes.length ? `<p class="workload-summary"><strong>${classes.length} subject${classes.length === 1 ? '' : 's'}</strong> · ${unitsKnown ? `${esc(units)} total units` : 'Total units not recorded; ask the Registrar.'}</p>${scheduleTable(classes)}` : `<div class="empty">${status === 'declined' ? 'No seats are reserved for this declined offer.' : 'No schedule offer is available yet.'}</div>`}${status === 'pending' ? '<div class="form-actions"><button class="button primary" data-response="accepted" type="button">Accept complete offer</button><button class="button" data-response="declined" type="button">Decline offer</button></div>' : ''}</section>${classes.length ? `<section class="panel separated-panel weekly-schedule" id="weekly-timetable" tabindex="-1"><div class="panel-head"><h2>Weekly timetable</h2></div><p class="field-help">Scroll sideways to view all days, or use the complete subject list above.</p><div class="schedule-grid" role="region" aria-label="Weekly timetable; scroll horizontally for more days" tabindex="0" style="--student-days:${days.length}">${days.map(day => `<div class="day-column"><div class="day-title">${esc(day)}</div>${classes.filter(c => c.day === day).sort((a,b) => a.start.localeCompare(b.start)).map(c => `<div class="class-card"><span>${esc(meetingTime(c.start))} – ${esc(meetingTime(c.end))}</span><strong>${esc(c.code)} · ${esc(c.section)}</strong><small>${esc(c.title)}<br>${esc(c.room)} · ${esc(c.instructor)}</small></div>`).join('')}</div>`).join('')}</div></section>` : ''}${status === 'confirmed' ? '<p class="print-disclaimer">Keep this copy for your records. Contact the Registrar if any enrollment details need correction.</p>' : ''}<section class="panel separated-panel enrollment-history" id="enrollment-history" tabindex="-1"><h2>Enrollment history</h2>${result.history?.length ? `<div class="table-wrap" role="region" aria-label="Enrollment history" tabindex="0"><table class="data-table"><thead><tr><th scope="col">Term</th><th scope="col">Status</th><th scope="col">Offer version</th><th scope="col">Subjects</th></tr></thead><tbody>${result.history.map(h => `<tr><td>${esc(h.term || h.termId)}</td><td>${esc(statusLabels[h.status] || h.status)}</td><td>${esc(h.revision)}</td><td>${esc((h.subjects || []).join(', '))}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty">No enrollment history yet.</div>'}</section>`);
  content.find('.student-page-links').attr('aria-label', 'Student navigation').append('<a href="/student.html?view=grades" data-student-view="grades">My grades</a>');
  promptBackSubjects(result);
}
async function refreshStudent() {
  const revision = screenRevision;
  $('#refresh-student').prop('disabled',true);
  try { const result = await api('/me'); if (revision === screenRevision) dashboard(result); }
  catch(error) {
    if (revision !== screenRevision) return;
    if (error.status === 401) { session = null; me = null; loginForm('Your session has ended. Sign in to continue.'); }
    else showError(error);
  }
  finally { $('#refresh-student').prop('disabled',false); }
}
$(document).on('click','#show-status',() => statusForm());
$(document).on('click','#show-registration',registration);
$(document).on('click','#show-login, #header-student-login',() => loginForm());
$(document).on('click','#show-account',accountForm);
$(document).on('click', '#review-back-subjects', reviewBackSubjects);
$(document).on('click', '#copy-student-id', async function () {
  const input = document.getElementById('registered-student-id');
  if (!input) return;
  this.disabled = true;
  try {
    await navigator.clipboard.writeText(input.value);
    $('#copy-id-feedback').text('Student ID copied.');
  } catch {
    input.focus(); input.select();
    $('#copy-id-feedback').text('Copy was unavailable. Your Student ID is selected; copy it or write it down.');
  } finally { this.disabled = false; }
});
$(document).on('click', '[data-student-view]', function(event) {
  if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
  event.preventDefault();
  if (this.dataset.studentView === 'grades' && session?.role === 'student') { openGrades(); return; }
  if (this.dataset.studentView === 'dashboard' && session?.role === 'student') setRoute(null);
  if (this.dataset.studentView === 'reset') { resetForm(); return; }
  if (this.dataset.studentView === 'help') { helpForm(); return; }
  if (session?.role === 'student') { if (me) dashboard(me); else refreshStudent(); return; }
  if (session) { staffSession(); return; }
  const views = { success: registrationSuccess, register: registration, login: () => loginForm(), status: () => statusForm(), account: accountForm };
  views[this.dataset.studentView]?.();
});
$(document).on('input change', '#registration-form input, #registration-form select', saveRegistrationDraft);
$(document).on('change', '#studentType', updateTypeHelp);
$(document).on('click', '#retry-registration', async function () {
  this.disabled = true;
  try {
    const published = await api('/public/config');
    config = { ...config, ...published, practice: Boolean(published.practice), institution: { ...institution, ...published.institution } };
    configAvailable = true;
    registration();
  } catch (error) { showError(new Error('The active term could not be checked. Try again while keeping this page open.'), document.getElementById('registration-form')); this.disabled = false; }
});
$(document).on('click', '#clear-registration', function () {
  $('#student-dialog').html('<p>Clear your unfinished registration details? Your student record will not be created until you submit.</p>').dialog({ title: 'Clear registration details', modal: true, resizable: false, width: Math.min(480, window.innerWidth - 30), buttons: [
    { text: 'Keep editing', click() { $(this).dialog('close'); } },
    { text: 'Clear form', click() { registrationDraft = {}; $(this).dialog('close'); registration(); } }
  ] });
});
$(document).on('click', '#print-confirmation', () => { if (me?.plan?.status === 'confirmed') window.print(); });
$(document).on('click','#refresh-student',refreshStudent);
$(document).on('submit','#registration-form',function(event) {
  event.preventDefault(); submit(this,async isCurrent => {
    const fields = Object.fromEntries(new FormData(this));
    const result = await api('/public/register',{ ...fields, consent: $('#privacy-consent').prop('checked'), semester: Number(fields.semester), status: 'Active' });
    if (!isCurrent()) return;
    registrationDraft = {};
    lookup = { id: result.id, email: fields.email, birth: fields.birth };
    registrationResult = { id: result.id, existing: result.existing };
    registrationSuccess();
  });
});
$(document).on('submit','#status-form',function(event) {
  event.preventDefault(); submit(this,async isCurrent => { const credentials = { id: $('#student-id').val().trim(), email: $('#status-email').val(), birth: $('#status-birth').val() }; const result = await api('/public/student', credentials); if (isCurrent()) { lookup = credentials; showStatus(result); } });
});
$(document).on('submit','#login-form',function(event) {
  event.preventDefault(); submit(this,async () => { await api('/auth/login',{ role: 'student', id: $('#login-id').val().trim(), password: $('#login-password').val() }); session = await api('/auth/status'); await openStudentDashboard(); });
});
$(document).on('submit','#account-form',function(event) {
  event.preventDefault(); submit(this,async isCurrent => { const credentials = { id: $('#account-id').val().trim(), email: $('#account-email').val(), birth: $('#account-birth').val() }; await api('/public/account',{ ...credentials, password: $('#account-password').val() }); if (isCurrent()) { lookup = credentials; if (registrationResult?.id === credentials.id) registrationResult.hasAccount = true; loginForm('Password set. Sign in with your student ID and new password.'); } });
});
$(document).on('submit', '#reset-password-form', function (event) {
  event.preventDefault();
  submit(this, async isCurrent => {
    if (!resetToken) throw new Error('Ask the Registrar for a reset link after identity verification.');
    const result = await api('/public/reset-password', { token: resetToken, password: this.elements['reset-password'].value });
    resetToken = '';
    this.reset();
    if (!isCurrent()) return;
    setRoute('reset', true);
    const student = result.role === 'student';
    showScreen(`<section class="panel form-panel student-session-panel"><h1>Password reset</h1>${notice('Your password has been changed. Sign in with your new password.')}<p>Resetting your password does not sign you in.</p><div class="form-actions"><a id="reset-sign-in" class="button primary" href="${student ? '/student.html?view=login' : '/staff.html'}">${student ? 'Student sign in' : 'Staff sign in'}</a></div></section>`);
  });
});
$(document).on('click', '#reset-sign-in', async function (event) {
  event.preventDefault();
  if (this.getAttribute('aria-busy')) return;
  this.setAttribute('aria-busy', 'true');
  try {
    if (session) {
      try { await api('/auth/logout', {}); } catch (error) { if (error.status !== 401) throw error; }
    }
    session = null; me = null; backSubjectDraft = null;
    location.assign(this.href);
  } catch (error) { showError(error); this.removeAttribute('aria-busy'); }
});
$(document).on('click','#student-logout',async function() {
  this.disabled = true;
  try { await api('/auth/logout',{}); backSubjectDraft = null; resetToken = ''; session = null; me = null; lookup = null; registrationDraft = {}; registrationResult = null; loginForm('You are signed out.'); }
  catch(error) { showError(error); this.disabled = false; }
});
$(document).on('click','[data-response]',function() {
  if (me?.plan?.status !== 'pending') return;
  const status = this.dataset.response, revision = me.plan.revision;
  $('#student-dialog').html(`<p>${status === 'accepted' ? 'Accept' : 'Decline'} the complete schedule offer for <strong>${esc(me.name)}</strong> (${esc(me.id)}), version ${esc(revision)}?</p><p>${status === 'accepted' ? 'Your seats remain reserved. The registrar will then confirm enrollment.' : 'Your reserved seats will be released. The school must prepare another offer.'}</p>`).dialog({ title: 'Respond to schedule offer', modal: true, resizable: false, width: Math.min(540,window.innerWidth - 30), buttons: [
    { text: 'Go back', click() { $(this).dialog('close'); } },
    { text: status === 'accepted' ? 'Accept offer' : 'Decline offer', async click() { const dialog = $(this); dialog.parent().find('button').prop('disabled',true); try { await api('/me/respond',{ status, revision }); dialog.dialog('close'); await refreshStudent(); $('#student-status').text(status === 'accepted' ? 'Offer accepted. Awaiting registrar confirmation.' : 'Offer declined. Seats released.'); } catch(error) { dialog.dialog('close'); showError(error); } finally { dialog.parent().find('button').prop('disabled',false); } } }
  ] });
});
let validationSummaryPending = false;
document.addEventListener('invalid', event => {
  if (!content[0].contains(event.target)) return;
  fieldError(event.target, event.target.validationMessage);
  if (!validationSummaryPending) {
    validationSummaryPending = true;
    const form = event.target.form;
    queueMicrotask(() => { validationSummaryPending = false; renderValidationSummary(form); $('#student-status').text('Check the fields needing attention. Your entries have been kept.'); });
  }
}, true);
$(document).on('click', '[data-error-field]', function (event) { event.preventDefault(); document.getElementById(this.dataset.errorField)?.focus(); });
$(document).on('input change','.student-school input, .student-school select',function () { clearFieldError(this); if ($(this.form).find('.validation-summary').length) renderValidationSummary(this.form); });
function staffSession() {
  showScreen(`<section class="panel form-panel student-session-panel"><h1>Staff session active</h1><p>You are signed in as ${session.role === 'department_head' ? 'Department Head' : 'Registrar'}. Open the staff workspace, or sign out to use a student account on this browser.</p><div class="form-actions"><a class="button primary" href="/staff.html">Open staff workspace</a><button class="button" id="student-logout" type="button">Sign out to use student portal</button></div></section>`);
}
async function openStudentDashboard() {
  showScreen('<section class="panel student-session-panel"><h1>Your student portal</h1><p role="status">Loading your enrollment record…</p><div class="button-row"><button class="button" id="refresh-student" type="button">Refresh status</button><button class="button" id="student-logout" type="button">Sign out</button></div></section>');
  await refreshStudent();
}
function requestedScreen() {
  if (new URL(location.href).searchParams.get('view') === 'reset') { resetForm(); return; }
  if (new URL(location.href).searchParams.get('view') === 'help') { helpForm(); return; }
  if (session?.role === 'student') {
    if (new URL(location.href).searchParams.get('view') === 'grades') return openGrades();
    if (me) dashboard(me); else return openStudentDashboard();
  }
  else if (session) staffSession();
  else {
    const view = new URL(location.href).searchParams.get('view');
    if (view === 'grades') loginForm('Sign in to view your grades.');
    else if (view === 'success') registrationSuccess();
    else if (view === 'login') loginForm();
    else if (view === 'status') statusForm();
    else if (view === 'account') accountForm();
    else registration();
  }
}
window.addEventListener('popstate', () => { navigatingHistory = true; try { requestedScreen(); } finally { navigatingHistory = false; } });
showScreen('<div class="empty" role="status">Opening student portal…</div>');
const [authResult, configResult] = await Promise.allSettled([api('/auth/status'), api('/public/config')]);
if (configResult.status === 'fulfilled') {
  const published = configResult.value;
  config = { institution: { ...institution, ...published.institution }, programs: Array.isArray(published.programs) ? published.programs : programs, term: published.term || null, practice: Boolean(published.practice) };
  configAvailable = true;
}
if (authResult.status === 'fulfilled') session = authResult.value.authenticated ? authResult.value : null;
await requestedScreen();
if (authResult.status === 'rejected') showError(new Error('Your session could not be checked. Reload this page to reconnect, or try signing in.'));

