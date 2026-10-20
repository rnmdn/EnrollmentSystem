# Enrollment System: agent instructions

## Project goal

Build a web application for student master records, course and subject scheduling, section allocation, and permanent student ID generation. Students register without an account. The registrar reviews records and assigns regular subjects; the Department Head assigns special-case subjects. The registrar offers a schedule, the student signs in to accept or decline, and the registrar confirms an accepted enrollment.

## Current architecture

- Use the Node 24 HTTP server and built-in SQLite database in `server/` for the current local application. The frontend is Vite, vanilla JavaScript, and jQuery UI. The original Laravel/PostgreSQL recommendation remains a deployment option, not the current stack.
- The database owns student number generation, records, and allocation checks. Do not restore browser-only writes.
- Keep the server bound to localhost until deployment security, backups, and school-specific privacy requirements are defined. Registrar pages and record APIs require a password-backed session; public student routes expose only registration and limited status lookup.
- Keep student identity separate from term enrollments. A student keeps one student ID across terms and section changes. Academic terms are stored in the database; the active term controls section and allocation views.
- Format student numbers as `YY-00001`: the two-digit calendar year when the record is created, followed by a five-digit sequence that resets each year. Existing numbers never change at a year boundary.
- Model students, subjects, academic terms, sections, and enrollments as separate entities with foreign keys and appropriate unique constraints. Current sections have one meeting time each; expand this only when multiple meetings are required.
- Enforce enrollment rules on the server: section capacity, duplicate enrollment, and student schedule conflicts. UI checks may improve feedback but cannot replace server validation.
- Students can register without an account. A student password is required to view schedules and respond to offers; public lookup exposes only review status. Existing students can set their first password using their ID, email, and birth date on this local application. Registrar setup runs once; only the registrar can configure Department Head access. New passwords use bcrypt, with legacy scrypt registrar password verification retained. Keep the app bound to localhost; verified account recovery and further access controls are required before shared deployment.
- Enforce subject assignment authority on the server: Registrar for regular students, Department Head for back subjects, transferees, returning students, Academic Recovery, and Accessible Learning. Only the registrar schedules and confirms. Pending offers reserve seats; decline releases them. Accepted and confirmed plans cannot be edited through allocation APIs. Require the current offer revision when a student responds.
- Curriculum entries cover programs, year levels 1–4, semesters 1–2, units, and prerequisite relationships. Load official school content through the curriculum screen; do not label invented subjects as the approved school curriculum.
- Apply numbered SQLite migrations without changing existing student IDs. Preserve legacy allocations as confirmed historical plans. Daily verified SQLite backups run while the server is running; off-device retention and production recovery targets require school configuration.

## jQuery UI requirement

Use components from [jQuery UI](https://jqueryui.com/) for relevant interactive screens. Consult the [demos](https://jqueryui.com/demos/) and [API documentation](https://api.jqueryui.com/) before implementing a component.

- Use **Autocomplete** for student, course, and subject lookup where search is more useful than a long select list.
- Use **Datepicker** for academic dates and **Dialog** for focused confirmation or edit flows.
- Use **Tabs** or **Accordion** for dense student and scheduling views when grouping content helps navigation.
- Use **Sortable** only where staff genuinely need manual ordering; persist the order on the server.
- Choose other jQuery UI widgets when they solve a real interaction need. Do not add every widget for demonstration purposes.
- Load compatible jQuery and jQuery UI versions and the required theme CSS. Prefer package managed assets and include only the components used.
- Keep jQuery UI initialization in small, page specific scripts. If a page uses a reactive frontend framework, isolate jQuery UI from DOM owned by that framework.
- Provide labels, keyboard access, visible focus, and clear validation messages. Check each chosen widget's accessibility behavior in the actual screen.

## Design direction

- Scope homepage presentation styles to `home-taste.css`. Keep GSAP motion in `home.js`, honor reduced-motion preferences, and keep the university motto static without a pause button. Keep student and staff workflows compact and independent from homepage motion.

- The institution is Pamantasan ng Lungsod ng Pasig (PLP). `/` is the public enrollment home, `/student.html` is the student portal, and `/staff.html` is the protected staff workspace. Institution metadata and source-linked program names live in `institution.js`; subject curricula must still be supplied and verified by staff. Use the shared PLP green identity. Keep source provenance and development status in project documentation; user-facing screens use concise enrollment service wording. Do not claim university approval or production readiness.

- Design for registrar and school staff who work with large amounts of data every day. Prioritize quick scanning, clear actions, and low error rates.
- Use the academic ledger visual direction in `styles.css`: deep green ink, cool paper surfaces, ruled data regions, Newsreader headings, Outfit body text, and Phosphor icons. Keep contrast strong and text large enough for daily record work.
- Use a consistent app shell with a compact side navigation, page title, breadcrumb where useful, and a prominent primary action. Keep the main content width comfortable for forms while allowing tables to use the available space.
- Give each screen one main task. Use summary cards sparingly; put searchable, filterable tables and clear detail views at the center of student and section management.
- Group long student forms into labeled sections. Mark required fields, show field-level errors, preserve entered values after validation failures, and show a clear success state after saving.
- Show schedule information as both a readable timetable and a list. Make meeting day, time, room, instructor, capacity, and enrollment status easy to compare.
- Display student IDs prominently but never treat them as editable display text after creation. Use a separate internal database key.
- Keep jQuery UI widgets visually consistent with the app theme. Customize their theme CSS where needed instead of letting default widget styling clash with the rest of the interface.
- Support desktop and smaller screens. Tables may scroll horizontally on narrow screens, but primary actions, labels, and validation messages must remain usable.
- Include empty, loading, error, and confirmation states for every core workflow. Use confirmation dialogs for destructive actions, with the affected student or section named explicitly.

## Working practices

- Implement one complete workflow at a time, including database rules, UI, and relevant verification.
- Use migrations for schema changes. Never rely on a generated student ID being unique without a database constraint.
- Add focused tests for ID uniqueness and allocation rules, especially simultaneous requests that could overfill a section.
- Keep real student data out of sample fixtures, screenshots, and logs.
- Update this file when the chosen stack or project conventions change.
- User requests every completed change be committed and pushed to origin/main (https://github.com/rnmdn/EnrollmentSystem). Verify the relevant change first and exclude credentials, local databases, backups, and screenshots. Report the pushed commit; never claim a push or deployment succeeded without confirmation.

## UX continuity conventions

- Preserve unfinished non-password forms in memory during in-app navigation; never persist passwords or consent as drafts. Warn before unloading dirty pages. Document that drafts do not survive reload.
- Public registration uses the active database term and a server-recorded Manila date. Reject stale terms rather than silently changing a submission.
- Published staff offers are read-only; student status explains the next responsible role and actual last update. Show units and a complete mobile subject list.
- Recovery help must use the existing record and school-approved identity verification. Do not invent online resets, processing promises or offer expiry policies.

- Student registration ends at a dedicated receipt with a copyable permanent ID. Keep password setup a separate optional step; prefill only the ID in first-password setup. A receipt without in-memory result data must offer existing-record help, never invent a successful submission or create a second ID.

## Evaluation and practice conventions

- Academic results accept raw percentages or the supplied transmuted grade scale. Derive Passed/Failed on the server; Not taken has no grade. These are the only three remarks. Do not invent grade bands or fabricate legacy grades.
- Use Individual evaluation for manual results and atomic CSV imports. Keep current evaluated results distinct from a full transcript of attempts. Changing results invalidates unfinished assignments and student retake choices. Published plans block grade edits.
- Failed subjects require the student's retake/defer decision after Registrar review, followed by Department Head approval. The Registrar alone selects sections, publishes schedules, and confirms accepted offers. Automatic prerequisite checks use verified passed results.
- Rooms and professors have catalogs; preserve legacy resource names while blocking case-insensitive time conflicts and room overcapacity.
- Account recovery is Registrar-assisted for Student and Department Head only, with a recorded school-approved identity verification reference. Single-use reset tokens are hashed in storage, expire in 30 minutes, and revoke existing sessions when redeemed. Initial Department Head setup cannot replace an existing password. There is no Registrar reset endpoint.
- Expanded practice fixtures live in data/practice-blocks.sqlite on localhost:3004 through npm run practice: 480 fictional BSIT students across 1A–1D through 4A–4D. Each block starts with 15 of 30 membership places used; the other 240 fictional students are unassigned for practice. Across all records, each group has 24 regular, four back-subject, one transferee and one returning student. Preserve progress on restart. The earlier two-student data/practice.sqlite remains available through npm run practice:small (same port; run one instance at a time). Never seed or reset main data/registrar.sqlite. Practice credentials appear only inside the practice workspace. Keep daily backup filenames separate for each database.

## Supplied 2022 curricula

- User-supplied BSIT and BSCS PDFs live unchanged in public/curriculum/. Their transcription is curriculum/plp-2022.js: BSIT 49 entries / 146 units, BSCS 51 / 146. Source notes and hashes are in docs/curriculum-sources.md. Do not claim this source version is the approved curriculum for a newer intake.
- Curriculum semester 3 means Summer. Preserve and display it separately; do not move Summer subjects into Semester 2. Enrollment terms still support Semesters 1 and 2.
- Standing requirements enforce both recorded year level and the supplied minimum passed units, counted within the same source curriculum. Never count unrelated practice examples toward those totals.
- Preserve historical section titles when codes are reused. Catalog-compatible section selection and server validation prevent legacy examples from being offered as differently named supplied subjects. Conflicting existing academic credits block catalog import.
- Curriculum imports are atomic and idempotent. Use numbered migrations and take a verified backup before migrating a populated database. Keep source descriptions per program; shared course codes can have minor wording differences.

- Section creation reads prerequisites and standing requirements from the selected curriculum subject. Display them read-only; curriculum requirements cannot be changed through the section API. Legacy integrations without curriculum entries keep their prior compatibility path.

## Permanent blocks

- A block identity consists of program, intake year and group letter; students retain that identity through years 1–4. Year level changes the displayed label (1A to 2A, etc.), never the membership or student ID. Registrar records year-level progression; there is no automatic academic promotion.
- Migration 10 adds block identities, one home block per student, audited membership history, term-specific block schedules and class links. Existing records and class offerings remain unchanged and unassigned to blocks until Registrar review.
- Only Registrar assigns/transfers home membership, with an explicit reason for transfers. Published plans block transfers until a later term. Block capacity and program compatibility are server enforced.
- Regular students with a home block receive its complete applicable curriculum schedule, excluding already passed subjects. Automatic prerequisite, standing, resource, student conflict and reservation checks remain mandatory. Each offer is atomic and requires student acceptance followed by Registrar confirmation.
- Special cases keep their home block while Department Head-approved subjects may use compatible classes in other blocks. Student retake/defer decisions remain required for failed subjects before approval. Each block timetable is prepared separately for each term from its selected curriculum source.
- Sections is the single navigation entry for permanent block groups. Its directory shows only section name and home-member count; selecting a section opens timetable, roster and membership history. Internal class offering IDs stay out of this directory. Legacy ungrouped offerings remain stored and available for allocation.
- Curriculum and report filters apply on dropdown change, preserving keyboard focus and the selected values. There is no Apply filters step.
- Remove Practice enrollment navigation and the walkthrough page from the application; keep isolated practice databases and CLI fixtures intact. Practice credentials are documented in the practice guides.
- The user explicitly requested one fictional back-subject example in the main local database: example.backsubject@example.test, Example Backsubject, BSIT 2D, failed COMP 103. This is an exception to the normal isolated-fixtures rule. Preserve existing records and never reset its password or retake choice on restart. Its current-term dependent subjects are reported to the owning student as blocked; they cannot be assigned until the failed prerequisite is passed.

## Navigation conventions

- Staff destinations are grouped into Workspace, Students, Enrollment, Academic setup and Administration. Department Heads keep role-scoped links; their activity group retains Audit history.
- Preserve legacy view URLs. Breadcrumbs and document titles identify nested student and section views; sidebar links keep real href targets and an active-page indicator.
- `navigation.js` owns desktop collapse preference and the mobile drawer. `navigation.css` styles staff and student navigation; public homepage navigation styles remain in `home-taste.css`.
- Mobile staff navigation starts closed, contains keyboard focus while open, supports Escape and backdrop dismissal, and closes after selecting a destination. Do not replace it with a full navigation grid above the content.
- Keep the overview task queue paged and detailed capacity analytics optional. Student first-password setup stays contextual; signed-in student shortcuts point to existing offer, timetable and history sections.

## Audit and reliability conventions

- Initial Department Head setup must be an atomic insert-only operation; verified recovery remains the path for replacing its password. Main and practice instances use distinct cookie names because localhost cookies are shared across ports.
- Publish new backups only after integrity, foreign-key and core-schema verification, without overwriting an existing recovery point. Existing daily files must also be verified. The exclusive publish operation requires filesystem hard-link support; report failure rather than silently treating an invalid file as a backup.
- Staff client conflict checks use `schedule-rules.js` for meeting times and academic date ranges; server validation remains authoritative. Keep independent directory queries and reuse the form submission guard for busy/error feedback.
- Use the representative 480-student load check in addition to the small in-memory smoke test. Do not claim the performance requirement passes while the full-data endpoint misses its p95 target. Preserve API contracts and role scoping when replacing the all-record bootstrap with paginated/on-demand reads.
