import $ from 'jquery';
import '@fontsource-variable/outfit';
import '@fontsource-variable/newsreader';
import '@phosphor-icons/web/regular';
import 'jquery-ui-dist/jquery-ui.css';
import './styles.css';
import './ui-refresh.css';
import './plp.css';
import './home-taste.css';
import { gsap } from 'gsap';
import { programs as fallbackPrograms, colleges, institution } from './institution.js';

window.jQuery = window.$ = $;
await import('jquery-ui-dist/jquery-ui.js');

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
let programs = fallbackPrograms;
let shownPrograms = [];
let selectedCollege = null;

function updateCollegeControls() {
  const track = document.getElementById('program-directory');
  const cards = [...track.querySelectorAll('.college-card')];
  const grid = track.classList.contains('is-grid');
  const totalPrograms = cards.reduce((sum, card) => sum + Number(card.dataset.programCount), 0);
  $('#college-results').text(cards.length ? cards.length + (cards.length === 1 ? ' college · ' : ' colleges · ') + totalPrograms + (totalPrograms === 1 ? ' program' : ' programs') : 'No matching colleges or programs');
  $('#college-previous').prop('disabled', grid || track.scrollLeft <= 2);
  $('#college-next').prop('disabled', grid || track.scrollLeft + track.clientWidth >= track.scrollWidth - 2);
  $('#college-previous, #college-next').prop('hidden', grid || cards.length < 2);
}
function renderPrograms(query = '') {
  const needle = query.trim().toLowerCase();
  const filtered = programs.filter(program => (program.name + ' ' + program.code + ' ' + program.college).toLowerCase().includes(needle));
  const matches = colleges.filter(college => filtered.some(program => program.college === college.name));
  $('#clear-program-search').prop('hidden', !query);
  const track = document.getElementById('program-directory');
  track.classList.toggle('is-grid', Boolean(needle));
  track.innerHTML = matches.length ? matches.map(college => {
    const offerings = filtered.filter(program => program.college === college.name);
    return '<article class="college-card" data-program-count="' + offerings.length + '"><button class="college-select" type="button" data-college="' + esc(college.name) + '" aria-pressed="false" aria-controls="college-programs"><span class="college-emblem"><img src="/colleges/' + esc(college.logo) + '.png" alt="" width="300" height="300" loading="lazy"></span><span class="college-card-content"><span class="college-card-name">' + esc(college.name) + '</span><span class="college-program-count">' + offerings.length + (offerings.length === 1 ? ' program' : ' programs') + '</span><span class="college-select-action">View programs <i class="ph ph-arrow-right" aria-hidden="true"></i></span></span></button></article>';
  }).join('') : '<div class="empty"><strong>No results for “' + esc(query.trim()) + '”</strong>Try a program code like BSN, a program name, or a college.</div>';
  $('#college-selection-status').text('');
  shownPrograms = filtered;
  selectedCollege = matches.some(college => college.name === selectedCollege) ? selectedCollege : matches[0]?.name || null;
  showCollegePrograms();
  track.scrollLeft = 0;
  updateCollegeControls();
}
function showCollegePrograms() {
  const college = colleges.find(item => item.name === selectedCollege);
  const panel = document.getElementById('college-programs');
  panel.hidden = !college;
  for (const button of document.querySelectorAll('.college-select')) {
    const active = button.dataset.college === selectedCollege;
    button.setAttribute('aria-pressed', String(active));
    button.querySelector('.college-select-action').innerHTML = (active ? 'Programs shown' : 'View programs') + ' <i class="ph ' + (active ? 'ph-check' : 'ph-arrow-right') + '" aria-hidden="true"></i>';
  }
  if (!college) { panel.innerHTML = ''; return; }
  const offerings = shownPrograms.filter(program => program.college === selectedCollege);
  panel.innerHTML = '<div class="college-programs-heading"><div><h3 id="college-programs-heading">' + esc(college.name) + '</h3><p>Select a program to start registration.</p></div><a href="' + institution.website + college.path + '" target="_blank" rel="noopener noreferrer">College website <i class="ph ph-arrow-up-right" aria-hidden="true"></i><span class="sr-only"> — opens in a new tab</span></a></div><ul>' + offerings.map(program => '<li><a class="college-program-link" href="/student.html?view=register&amp;program=' + encodeURIComponent(program.code) + '" aria-label="Register for ' + esc(program.name) + '"><span><span class="college-program-code">' + esc(program.code) + '</span><span>' + esc(program.name) + '</span></span><i class="ph ph-arrow-up-right" aria-hidden="true"></i></a></li>').join('') + '</ul>';
}
$('#program-directory').on('click', '.college-select', function () {
  selectedCollege = this.dataset.college;
  showCollegePrograms();
  const count = shownPrograms.filter(program => program.college === selectedCollege).length;
  $('#college-selection-status').text(selectedCollege + ': ' + count + (count === 1 ? ' program shown below.' : ' programs shown below.'));
});
function scrollColleges(direction, oneCard = false) {
  const track = document.getElementById('program-directory');
  const distance = oneCard ? (track.querySelector('.college-card')?.getBoundingClientRect().width || track.clientWidth) + 20 : track.clientWidth;
  track.scrollBy({ left: direction * distance, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}
$('#college-previous').on('click', () => scrollColleges(-1));
$('#college-next').on('click', () => scrollColleges(1));
$('#program-directory').on('scroll', updateCollegeControls).on('keydown', event => {
  if (event.target !== event.currentTarget || event.currentTarget.classList.contains('is-grid')) return;
  if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
    event.preventDefault();
    if (event.key === 'Home' || event.key === 'End') event.currentTarget.scrollTo({left: event.key === 'Home' ? 0 : event.currentTarget.scrollWidth, behavior: 'instant'});
    else scrollColleges(event.key === 'ArrowRight' ? 1 : -1, true);
  }
});
new ResizeObserver(updateCollegeControls).observe(document.getElementById('program-directory'));

// Touch uses native scrolling; mouse and pen also support grabbing the cards.
const collegeTrack = document.getElementById('program-directory');
let collegeDrag = null;
let suppressCollegeClickUntil = 0;
collegeTrack.addEventListener('pointerdown', event => {
  if (!['mouse', 'pen'].includes(event.pointerType) || event.button !== 0 || collegeTrack.scrollWidth <= collegeTrack.clientWidth) return;
  suppressCollegeClickUntil = 0;
  collegeDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, scroll: collegeTrack.scrollLeft, moved: false };
});
collegeTrack.addEventListener('pointermove', event => {
  if (!collegeDrag || event.pointerId !== collegeDrag.id) return;
  const dx = event.clientX - collegeDrag.x, dy = event.clientY - collegeDrag.y;
  if (!collegeDrag.moved) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
    if (Math.abs(dy) > Math.abs(dx)) { collegeDrag = null; return; }
    collegeDrag.moved = true;
    collegeTrack.classList.add('is-dragging');
    collegeTrack.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
  collegeTrack.scrollLeft = collegeDrag.scroll - dx;
});
function finishCollegeDrag(event) {
  if (!collegeDrag || event.pointerId !== collegeDrag.id) return;
  if (collegeDrag.moved) suppressCollegeClickUntil = performance.now() + 500;
  collegeDrag = null;
  collegeTrack.classList.remove('is-dragging');
  if (collegeTrack.hasPointerCapture(event.pointerId)) collegeTrack.releasePointerCapture(event.pointerId);
}
collegeTrack.addEventListener('pointerup', finishCollegeDrag);
collegeTrack.addEventListener('pointercancel', finishCollegeDrag);
collegeTrack.addEventListener('lostpointercapture', finishCollegeDrag);
collegeTrack.addEventListener('pointerleave', () => { if (collegeDrag && !collegeDrag.moved) collegeDrag = null; });
collegeTrack.addEventListener('dragstart', event => event.preventDefault());
collegeTrack.addEventListener('click', event => {
  if (event.detail && performance.now() < suppressCollegeClickUntil) { event.preventDefault(); event.stopPropagation(); }
}, true);

function bindProgramSearch() {
  if ($('#program-search').autocomplete('instance')) $('#program-search').autocomplete('destroy');
  $('#program-search').autocomplete({
    minLength: 1,
    source: programs.map(program => ({ label: `${program.name} · ${program.code}`, value: program.name })),
    select: (_event, ui) => { renderPrograms(ui.item.value); }
  });
}

$('#program-search').on('input', function () { renderPrograms(this.value); });
$('#clear-program-search').on('click', () => { $('#program-search').val('').trigger('focus'); renderPrograms(); });
$('#enrollment-questions').accordion({ heightStyle: 'content', collapsible: true, active: false, animate: false, icons: false });

const motion = gsap.matchMedia();
motion.add('(prefers-reduced-motion: no-preference)', () => {
  gsap.from('.hero-art img', { y: 10, duration: .5, ease: 'expo.out', clearProps: 'all' });
});
if (import.meta.hot) import.meta.hot.dispose(() => motion.revert());
renderPrograms();
bindProgramSearch();

try {
  const response = await fetch('/api/public/config');
  if (!response.ok) throw new Error('Service unavailable');
  const config = await response.json();
  if (Array.isArray(config.programs) && config.programs.length) programs = config.programs;
  $('#public-term').text(config.term?.label || 'Academic term to be announced');
  renderPrograms($('#program-search').val());
  bindProgramSearch();
} catch {
  $('#public-term').text('Enrollment service unavailable — please try again shortly.').addClass('service-unavailable');
}

// Keep the public navigation focused on enrollment guidance, programs and help.
const homeMenu = document.getElementById('home-menu-toggle');
const homeNavigation = document.getElementById('home-navigation');
function closeHomeMenu() {
  document.body.classList.remove('home-menu-open');
  homeMenu.setAttribute('aria-expanded', 'false');
}
homeMenu.addEventListener('click', () => {
  const open = document.body.classList.toggle('home-menu-open');
  homeMenu.setAttribute('aria-expanded', String(open));
});
homeNavigation.addEventListener('click', event => { if (event.target.closest('a')) closeHomeMenu(); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.body.classList.contains('home-menu-open')) { closeHomeMenu(); homeMenu.focus(); }
});
matchMedia('(max-width: 760px)').addEventListener('change', closeHomeMenu);
const sectionObserver = new IntersectionObserver(entries => {
  for (const entry of entries) if (entry.isIntersecting) {
    homeNavigation.querySelectorAll('a').forEach(link => {
      if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
}, { rootMargin: '-10% 0px -55% 0px', threshold: 0 });
['enrollment-guide', 'programs', 'questions'].forEach(id => sectionObserver.observe(document.getElementById(id)));
