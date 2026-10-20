# Navigation and interface update

20 October 2026

## Problems addressed

- Daily record work, enrollment processing and occasional setup competed in one long menu.
- The mobile staff menu expanded into a large grid above the page content.
- Nested student and section pages lacked a consistent trail back to their directory.
- The overview could render hundreds of task rows and repeated capacity statistics.
- Subject-level class offerings and permanent sections shared ambiguous labels.
- Student registration, status lookup and account tasks needed clearer entry points.

## Navigation structure

| Group | Destinations |
| --- | --- |
| Workspace | Overview, Reports |
| Students | Student records, Individual evaluation |
| Enrollment | Subject assignments, Schedule offers, Sections, Student timetables |
| Academic setup | Curriculum, Rooms & professors, Academic terms |
| Administration | Audit history, Staff access, Account recovery |

Administration is a native disclosure for occasional tasks. Department Heads retain their existing permitted destinations; the final group is labelled Activity and contains Audit history. Restricted links remain hidden, and server policies remain authoritative.

Existing `staff.html?view=...` routes are preserved. Sidebar destinations are links with real URLs, current-page indicators and ordinary modified-click behavior. Nested views show breadcrumbs and an appropriate document title. Student context and existing in-memory form handling are retained.

## Layout and interaction

- Desktop navigation collapses to an icon rail. Labels remain available through link titles; only the layout preference is stored locally.
- At 900px and below, navigation becomes a closed-by-default drawer. Opening it contains keyboard focus and makes workspace content inert. Close, Escape, the backdrop and selecting a destination dismiss it. Explicit dismissal returns focus to the menu button.
- The sidebar and workspace scroll separately. Reduced-motion preferences disable the navigation transition.
- Overview tasks use eight-row pages with Previous and Next controls; all tasks remain accessible. Detailed class capacity analytics are an optional disclosure.
- Dashboard labels distinguish scheduled classes and subject reservations from permanent block sections. The section shortcut opens the block directory.
- Student entry navigation contains Register, Student sign in and Check registration. First-password setup remains contextual to registration and sign-in.
- Student breadcrumbs and page titles identify the current task. Signed-in students can jump directly to Status & offer, Weekly timetable when available, and Enrollment history.
- The public homepage has a compact mobile Menu and active section indicators. Its presentation rules remain in `home-taste.css`, independently of staff navigation.

## Verification

The frontend build passed and all 62 existing automated tests passed. Live browser checks used fictional practice records; no academic results, memberships, schedule offers or passwords were changed.

Checks completed:

- All fourteen Registrar sidebar destinations opened with matching active links, page titles and breadcrumbs.
- Department Head navigation retained audit access and hid Registrar-only setup and enrollment actions.
- Desktop sidebar expanded/collapsed; all destination icons remained available in the collapsed state.
- Mobile drawer opened, closed on selection and Escape, and returned focus on explicit dismissal.
- Nested section navigation and browser Back returned to the correct section detail state.
- Dashboard pagination advanced from tasks 1-8 to 9-16.
- Student registration, status lookup, sign-in and first-password navigation opened their existing routes.
- A fictional unsaved registration first name survived navigation to status lookup and back; it was then cleared without submission.
- Student timetable and history shortcuts reached their corresponding page anchors.
- Mobile homepage menu opened, navigated to Colleges & programs and closed after selection.
- Staff layouts were inspected at desktop, 390px phone and 820px tablet widths. Student registration was inspected at 390px and 820px; neither required horizontal page scrolling. The mobile homepage menu was inspected at 390px.

This is a local interface verification, not a claim of complete WCAG compliance or testing on every browser/device. Existing table regions retain horizontal scrolling where needed. No API routes, database schema, enrollment rules or deployment settings were changed.
