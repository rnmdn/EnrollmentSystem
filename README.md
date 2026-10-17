# Pamantasan ng Lungsod ng Pasig Enrollment

A localhost application using Node 24, SQLite, Vite, vanilla JavaScript, jQuery, and jQuery UI. The supplied October 2026 design's functional workflows are implemented on this stack. Laravel, MariaDB, Blade, Bootstrap, and Sanctum are not runtime dependencies.

## Run and verify

```powershell
npm install
npm run dev
```

Open the Vite URL for the PLP enrollment home page. Staff use `/staff.html`; students use `/student.html`. Direct student links accept `?view=register`, `?view=login`, `?view=status`, `?view=account`, `?view=help`, or `?view=success` (receipt in the current tab). For the built app, run `npm run build` then `npm start`. Both servers bind to `127.0.0.1`.

The university name and 13 program options are configured in `institution.js`, based on PLP's published 2026–2027 admissions notice. Program names come from that admissions notice. The subject catalog separately includes the user-supplied 2022–2023 BSIT and BSCS curricula; other programs still need staff-supplied subjects. The public home includes a program search, enrollment guide, and help accordion. Student records remain in the local database. Source provenance and development status are maintained in this documentation rather than in the public interface.

The public homepage uses `home-taste.css` and an optimized transparent book illustration (`public/plp-book-hero.webp`). The active term, registration, sign-in and status lookup are visible in the compact introduction. Meaningful text stays visible without scrolling animation. Reduced-motion preferences disable the subtle book entrance. The university motto is static and has no pause button. Operational student and staff screens keep their compact ledger layout.

The header seal and browser icon use the original PLP asset downloaded from the university website. Source URLs for the seal and full wordmark are recorded in `public/branding-sources.md`.

```powershell
npm test
npm run build
npm run test:load
```

Tests use sample records and isolated databases. The test runner uses no process isolation because restricted Windows environments may reject child process spawning. The load check measures local authenticated API requests, not full browser or production load.

## Registrar guide

1. Set the registrar password on first use. Under Staff access, configure a separate Department Head password.
2. Create or activate the academic term (Semester 1 or 2). Student master records and permanent IDs persist across terms.
3. Enter verified Curriculum subjects: program, year 1–4, semester 1–2, units and prerequisites. Add prerequisite subjects first. Obtain the official list from the school; sample subjects are not an approved curriculum.
4. Create sections with instructor, room, capacity, weekday, time and optional academic start/end dates. The server blocks room and instructor conflicts.
5. Review pending registrations and verify classifications. Use Individual evaluation to enter actual grades manually or preview and import a CSV. Failed subjects trigger a student back-subject decision before Department Head approval.
6. Assign curriculum subjects for regular students. Special-case assignment belongs to the Department Head. In Enrollment, choose exactly one section per assigned subject and publish the offer.
7. Pending offers reserve seats. After student acceptance, confirm enrollment. Declining releases seats; a replacement special offer needs a new Department Head assignment.
8. Reports filter enrollment records and unassigned active-term students by term, program and status, with CSV export. Audit history records actor, action, affected record and time.

## Department Head guide

Sign in with the Department Head role and password configured by the registrar. Only special student records are returned: back subjects, transferees, returning students, Academic Recovery and Accessible Learning. Review the individual evaluation report after registrar review. When failed results exist, wait for the student to select retakes or defer them. Approve eligible subjects; a deferred failed subject and its unpassed dependents remain blocked. The registrar schedules sections and confirms enrollment. Reports and history are scoped to special cases.

## Student guide

Register without an account and acknowledge the privacy notice. The dedicated receipt shows a copyable permanent Student ID and offers optional first-password setup as a separate step. Only the ID is prefilled on that setup form; email and birth date must be entered again. The receipt stays in memory in the current tab, with a safe existing-record recovery screen after reload. Existing students can create their first password with their ID, registration email and birth date. Public lookup shows only review status. Sign in to view the offered timetable and list, accept or decline the complete offer, and see final confirmation. Students choose only which recorded failed subjects they want to retake before Department Head approval. They cannot select other subjects or sections, or confirm their own enrollment.

New passwords use bcrypt: at least eight characters and at most 72 UTF-8 bytes. Existing scrypt registrar passwords remain usable. Sessions expire after eight hours of inactivity; a Department Head password change revokes that role's sessions. First-use setup cannot reset an existing password. Students and the Department Head can recover an existing account through the Registrar after school-approved identity verification. Account recovery records a verification reference and issues a single-use link valid for 30 minutes. The recipient chooses a new password; existing sessions are revoked. The Registrar has no password-reset route. The link is shown locally, not emailed; the school must define the verification procedure before shared deployment.

## Database and recovery

Records are in `data/registrar.sqlite`, excluded from Git. Numbered migrations preserve student IDs and allocations; legacy allocations become confirmed plans marked `legacy:registrar`. Registrar-only import can preserve browser prototype records in an empty database, removing the browser copy only after successful import.

IDs use `YY-00001`, based on the UTC+8 calendar year when created. The sequence resets annually. Database uniqueness and immediate transactions protect concurrent registration and allocation.

While the server runs, startup and hourly checks create one verified snapshot per UTC+8 day in `data/backups/`. Online SQLite backups include WAL commits and run integrity and foreign key checks. Existing recovery files are never overwritten.

```powershell
npm run backup
npm run restore-check -- data/backups/registrar-2026-10-16.sqlite data/restore-check.sqlite
```

For recovery, stop both servers, preserve the damaged database and any WAL/SHM files, then replace the live database with the checked restore copy. Restart and reconcile records. Never replace a database in use. Keep recovery copies on a separate device under the school retention policy. Local backups run only while the application is running and do not establish production RPO/RTO by themselves.

## Approval inputs

See [criteria.md](criteria.md) for requirement mapping and remaining evidence. School identity verification, official curriculum, retention periods, hosting, privacy review, off-device recovery, browser/UAT checks and professor sign-off remain external inputs. Keep real student data out of fixtures, screenshots and logs.

## UX behavior and verification

Registration uses the active school term and server-recorded Manila submission date. Non-password registration and staff form drafts survive in-app navigation in the same tab, with an unload warning for unsaved work; they do not survive reload. Passwords are excluded, and student consent must be confirmed again. The Help & recovery page explains Registrar-assisted recovery without exposing a reset bypass.

Student offers include units, next actions, update times and a phone-friendly subject list. Confirmed schedules can be printed as demonstration copies. Staff published offers remain read-only, while the task queue surfaces reviews, assignment preparation and accepted enrollments. Staff view, selected student and filters are restored from the URL/history.

See [UX implementation and research plan](docs/ux-improvements.md) for the ten audit findings, verification evidence, limitations and remaining school decisions.

## Colleges showcase

The homepage college carousel uses the seven college marks and college-page URLs published on the official PLP homepage; sources are recorded in `public/colleges/sources.md`. It supports click-and-drag browsing, native touch swiping, arrow buttons, keyboard arrows/Home/End, program search and query-specific empty results. College cards keep consistent heights, with the selected college’s programs displayed in a shared panel below the strip. Program text is at least 14px and scrollbars are hidden. Each program links to registration with its code in the URL; the form accepts only a configured program code and keeps the program editable without overwriting an existing draft. Dragging across a link does not activate it. Browsing is manual and reduced-motion preferences disable smooth scrolling. College metadata lives in `institution.js`; program names retain the admissions source and are not an approved subject curriculum.

## Interface copy

User-facing screens use enrollment service wording. Source attributions, asset provenance and development limitations remain in project documentation instead of page footnotes. This presentation change does not establish university approval or production readiness. Passwords remain hash-only; no default login or credential reset was introduced.

## Academic results and practice workflow

Only **Passed, Failed, and Not taken** are result remarks. The grading table supplied in the project brief maps raw percentages to transmuted grades: 97.50+ → 1.00; 94.50+ → 1.25; 91.50+ → 1.50; 88.50+ → 1.75; 85.50+ → 2.00; 82.50+ → 2.25; 79.50+ → 2.50; 76.50+ → 2.75; 74.50+ → 3.00; below 74.50 → 5.00. Raw grades must be 0–100 with at most two decimals. Direct transmuted grades use the listed values. The server derives the remark and rejects contradictions. Not taken has no numeric grade. Legacy completion credits may have no recorded grade; no grade is fabricated during migration.

The evaluation screen records the current verified result for each student and subject, not a full transcript of all attempts. CSV imports validate every row in one transaction; one invalid row rejects the whole import. Result changes clear unfinished assignments and back-subject decisions so approval uses current evidence. Published offers must be resolved before editing their supporting results. Evaluation reports can be printed or saved as PDF through the browser. Official curriculum content and academic result evidence must be supplied by authorized school staff.

The staff shell uses a white sidebar and mint working surface. Rooms and professors have searchable selections in scheduling; the server checks room capacity and overlapping room, professor, and student times. Existing free-text resource names remain compatible with historical sections.

Run `npm run build` and `npm run practice` to open the separate practice instance on **http://127.0.0.1:3004**. Its expanded synthetic records live only in `data/practice-blocks.sqlite`; the existing `data/registrar.sqlite` is not seeded or reset. Practice credentials and a walkthrough are documented in [expanded practice guide](docs/practice-blocks.md). Each database receives its own daily backup filename.

## Supplied BSIT and BSCS curriculum

The two user-supplied 2022–2023 PDFs are now included. BSIT has 49 entries / 146 units and BSCS 51 entries / 146 units, with automatic subject prerequisites and printed year-standing checks. Staff can filter the Curriculum screen by program, year and Semester / Summer and open each original PDF. The Registrar can use Load supplied curricula; matching imports are idempotent and conflicting credit records stop the entire import.

For an existing local database, stop the app and run `npm run import:curriculum`. A verified backup is created before migration/import. Restart the app afterward. The expanded practice entry point imports the supplied catalog and seeds 480 fictional students across 16 permanent blocks. The original two-student practice database remains separate through `npm run practice:small`. Summer entries are retained in the catalog; the enrollment calendar still supports Semesters 1 and 2. [Source and transcription notes](docs/curriculum-sources.md) record source hashes, credit totals, standing rules and historical-title compatibility.

## Permanent blocks and expanded examples

The Sections directory now shows one row per permanent group with its name and number of students. Select the section name to open its timetable, roster and membership history. Curriculum and report dropdowns filter immediately. Practice enrollment navigation has been removed; isolated practice fixtures remain available through the CLI and the practice guides.

The owning student sees a portal notice and a retake dialog identifying current-term subjects blocked by failed prerequisites. Blocked subjects cannot be assigned or offered. The main local database contains one user-requested fictional example, Example Backsubject (example.backsubject@example.test), with failed COMP 103 and blocked COMP 104, COMP 105, IT 201 and IT 202. This local database is excluded from Git; public source contains no exported student database.

Migration 10 adds permanent groups by program, intake year and letter. A learner keeps the same group from 1A to 4A; only Registrar can assign or transfer membership. Transfers require a reason and keep history. Registrar updates year level; advancing a calendar year does not promote a student automatically. Existing main records have no invented block assignment.

**Blocks** provides the active-term curriculum timetable, roster and membership history. Registrar selects catalog rooms and professors; overlapping block classes, room/professor clashes and capacity errors are rejected. Regular students receive their applicable block classes together; irregular students retain their home block while taking eligible Department Head-approved classes elsewhere. Published offers still require student acceptance and Registrar confirmation.

`npm run practice` now uses `data/practice-blocks.sqlite` on localhost:3004. It has 30 fictional learners in each of 16 groups (1A–1D, 2A–2D, 3A–3D, 4A–4D), 100 block classes and three Friday retake classes. Each block starts with 24 regular students, four with back subjects, one transferee and one returning student. Capacity is 40 so transfers and guest classes can be tried. The older `data/practice.sqlite` stays separate (`npm run practice:small`, same port; stop the expanded instance first). Startup preserves existing progress and credentials. See [walkthrough and practice passwords](docs/practice-blocks.md).
