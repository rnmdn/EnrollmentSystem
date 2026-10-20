const labels = {
  overview: ['Workspace', 'Overview'], reports: ['Workspace', 'Reports'],
  students: ['Students', 'Student records'], evaluation: ['Students', 'Individual evaluation'],
  assignments: ['Enrollment', 'Subject assignments'], enroll: ['Enrollment', 'Schedule offers'],
  sections: ['Enrollment', 'Sections'], schedule: ['Enrollment', 'Student timetables'],
  curriculum: ['Academic setup', 'Curriculum'], resources: ['Academic setup', 'Rooms & professors'], terms: ['Academic setup', 'Academic terms'],
  audit: ['Administration', 'Audit history'], staff: ['Administration', 'Staff access'], access: ['Administration', 'Account recovery']
};
const mobile = matchMedia('(max-width: 900px)');
let collapsed = false;
try { collapsed = localStorage.getItem('plp-navigation-collapsed') === 'true'; } catch { /* Storage is optional. */ }
function setDrawer(open, restoreFocus = false) {
  const sidebar = document.getElementById('staff-navigation');
  document.body.classList.toggle('navigation-open', open);
  document.getElementById('navigation-backdrop').hidden = !open;
  sidebar.inert = mobile.matches && !open;
  if (mobile.matches && open) { sidebar.setAttribute('role', 'dialog'); sidebar.setAttribute('aria-modal', 'true'); }
  else { sidebar.removeAttribute('role'); sidebar.removeAttribute('aria-modal'); }
  document.querySelector('.workspace').inert = mobile.matches && open;
  document.getElementById('sidebar-toggle').setAttribute('aria-expanded', String(mobile.matches ? open : !collapsed));
  if (open) { sidebar.scrollTop = 0; document.getElementById('navigation-close').focus(); }
  else if (restoreFocus) document.getElementById('sidebar-toggle').focus();
}
export function initStaffNavigation() {
  const toggle = document.getElementById('sidebar-toggle');
  const resize = () => {
    document.body.classList.toggle('sidebar-collapsed', !mobile.matches && collapsed);
    setDrawer(false);
    toggle.setAttribute('aria-label', mobile.matches ? 'Open navigation' : collapsed ? 'Expand navigation' : 'Collapse navigation');
  };
  resize(); mobile.addEventListener('change', resize);
  toggle.setAttribute('aria-label', mobile.matches ? 'Open navigation' : collapsed ? 'Expand navigation' : 'Collapse navigation');
  toggle.addEventListener('click', () => {
    if (mobile.matches) setDrawer(!document.body.classList.contains('navigation-open'));
    else {
      collapsed = !collapsed;
      document.body.classList.toggle('sidebar-collapsed', collapsed);
      document.getElementById('staff-navigation').scrollTop = 0;
      toggle.setAttribute('aria-expanded', String(!collapsed));
      toggle.setAttribute('aria-label', collapsed ? 'Expand navigation' : 'Collapse navigation');
      try { localStorage.setItem('plp-navigation-collapsed', String(collapsed)); } catch { /* Optional preference. */ }
    }
  });
  document.getElementById('navigation-close').addEventListener('click', () => setDrawer(false, true));
  document.getElementById('navigation-backdrop').addEventListener('click', () => setDrawer(false, true));
  document.getElementById('staff-navigation').addEventListener('click', event => {
    if (event.target.closest('a[data-page]') && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) setDrawer(false);
  });
  document.addEventListener('keydown', event => {
    if (!mobile.matches || !document.body.classList.contains('navigation-open')) return;
    if (event.key === 'Escape') { event.preventDefault(); setDrawer(false, true); }
    if (event.key === 'Tab') {
      const links = [...document.querySelectorAll('#staff-navigation button, #staff-navigation a, #staff-navigation summary')].filter(el => el.getClientRects().length && !el.closest('[hidden]'));
      const first = links[0], last = links.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  });
}
export function updateStaffNavigation({ page, registrar, student, block }) {
  const [view] = page.split(':');
  const parent = view.startsWith('student') ? 'students' : ['blocks', 'section-new'].includes(view) ? 'sections' : view;
  const [group, label] = labels[parent] || labels.overview;
  let detail = '';
  if (view === 'student-new') detail = 'Register student';
  else if (view === 'student' || view === 'student-edit') detail = `${student?.id || 'Student'}${view === 'student-edit' ? ' / Edit' : ''}`;
  else if (view === 'blocks') detail = block?.label || document.querySelector('#main h1')?.textContent || 'Section details';
  else if (view === 'section-new') detail = 'Create class offering';
  let crumbs = document.getElementById('workspace-breadcrumbs');
  if (!crumbs) { crumbs = document.createElement('nav'); crumbs.id = 'workspace-breadcrumbs'; crumbs.className = 'workspace-breadcrumbs'; crumbs.setAttribute('aria-label', 'Breadcrumb'); document.getElementById('main').prepend(crumbs); }
  const add = (text, href, current = false) => {
    const el = document.createElement(href ? 'a' : 'span'); el.textContent = text;
    if (href) { el.href = `/staff.html?view=${href}`; el.dataset.page = href; }
    if (current) el.setAttribute('aria-current', 'page');
    if (crumbs.childElementCount) { const separator = document.createElement('span'); separator.className = 'breadcrumb-separator'; separator.textContent = '/'; separator.setAttribute('aria-hidden', 'true'); crumbs.append(separator); }
    crumbs.append(el);
  };
  add(!registrar && group === 'Administration' ? 'Activity' : group); add(label, detail ? parent : null, !detail); if (detail) add(detail, null, true);
  document.title = `${detail || label} | PLP Staff Workspace`;
  const admin = document.getElementById('administration-nav');
  admin.hidden = false;
  admin.querySelector('summary').textContent = registrar ? 'Administration' : 'Activity';
  if (group === 'Administration') admin.open = true;
  // Collapsed rails show all icons, including occasional administration destinations.
  document.querySelectorAll('.nav-group').forEach(section => {
    section.hidden = ![...section.querySelectorAll('.nav-link')].some(link => registrar || ['overview','students','evaluation','assignments','curriculum','schedule','reports','audit'].includes(link.dataset.page));
  });
}
