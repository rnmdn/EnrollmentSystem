# Enrollment system audit and development roadmap

20 October 2026

## Conclusion

The local application implements the main enrollment workflows. It is not production-ready. This audit fixed confirmed account-setup, recovery-point, scheduling-selection, session-isolation and form-feedback defects, and reduced unnecessary database reads. The representative staff-data load test still exceeds the proposed three-second target. Internet deployment, verified identity procedures, off-device recovery and school acceptance remain release gates.

No live student results, memberships, offers, passwords or IDs were edited. No schema migration, new role or hosted deployment was introduced. Screenshots, database snapshots and restore files remain outside Git.

## Review scope and confidence

Reviewed the three HTML entry points, app/student/home/navigation JavaScript, shared styling, curriculum/institution definitions, grade/CSV utilities, Node HTTP routes, SQLite migrations and business rules, backup/import commands, practice fixtures, package scripts and existing tests/documentation. Browser checks used fictional practice records. Main-database checks were read-only except for creating new verified backup and restore-copy files.

Evidence labels below distinguish reproduced failures, source findings and unverified release gates. This is not a penetration test or an accessibility certification. Not every possible button/state combination was manually exercised. External university pages and every browser/assistive-technology combination were not revalidated.

## Already completed and working

| Area | Verified implementation |
| --- | --- |
| Registration | Account-free registration, required server validation, consent recording, duplicate checks, permanent annual Student IDs and safe existing-record reuse |
| Student access | First-password setup cannot overwrite an account; own-record login, limited public status lookup, receipt ID copying and Registrar-assisted recovery |
| Roles | Registrar regular assignments; Department Head special-case assignments; only Registrar schedules and confirms; scoped records and reports |
| Curriculum | Supplied 2022 BSIT 49 entries/146 units and BSCS 51/146; prerequisite and standing checks; atomic imports; Summer remains distinct |
| Academic results | Manual entry and atomic CSV imports, raw/transmuted conversion, Passed/Failed/Not taken, blocked prerequisites and student retake/defer choices |
| Permanent sections | Home membership, audited transfers, term timetables, rosters, resource selection and complete applicable block offers |
| Enrollment | Transactional reservations, duplicate/capacity/student/resource conflict guards, offer revisions, acceptance/decline and Registrar confirmation |
| Reporting | Filtered reports and CSV formula escaping, block labels, audit records, student schedule list/timetable/history |
| Navigation | Fourteen staff destinations, role filtering, breadcrumbs, collapsible desktop rail and mobile drawer; student/public entry routes |
| Data protection | Hashed passwords/tokens, expiring sessions and reset tokens, no public schedule lookup, SQLite constraints and verified local recovery copies |

The automated suite exercises these rules; live checks cover representative screens and interactions. These statements do not imply school sign-off or public hosting readiness.

## Findings and actions

### P0 - Critical recovery risks and release blockers

**AUD-01 - A daily backup filename was trusted without checking its contents. Fixed.**

- Evidence: source inspection found that the scheduler skipped an existing filename; regression tests now reject corrupt and empty files. No loss of current records was found.
- Why it matters: a failed or damaged recovery file could silently be treated as the day's backup. Concurrent manual backups could race between the existence check and the write.
- Files: `server/backup.js`, `server/backup.test.js`.
- Implementation: create a unique partial file, check SQLite integrity, foreign keys and core enrollment tables, publish exclusively using a same-directory hard link, and remove the partial file. Recheck an existing daily recovery point and report errors. Never overwrite recovery points or the live database. This requires filesystem hard-link support; it passed in this Windows workspace and the temp test location.

**AUD-02 - The localhost security model is not an Internet deployment design. Open release gate.**

- Evidence: `server/http.js` binds to loopback, keeps sessions in memory, uses a localhost cookie without Secure, allows initial Registrar bootstrap, and supports first-password setup using ID/email/birth date. These are deliberate local conventions.
- Why it matters: publishing the frontend alone does not create a persistent backend. Multiple server instances would not share sessions, and demographic details are not verified ownership of an online account.
- Files: `server/http.js`, `dev.js`, `vite.config.js`, `README.md`, `AGENTS.md`.
- Required work: agree on the hosting and persistent database model; define TLS/proxy configuration, secure cookie and request-origin policy, restricted bootstrap and approved identity/recovery procedures; design session persistence/revocation for that environment. Keep localhost binding until these gates pass. Do not treat missing production controls as evidence of a demonstrated remote exploit of the current loopback-only server.

**AUD-03 - Recovery is local and operational ownership is incomplete. Open release gate.**

- Evidence: automatic backups run while the server is running and stay beside its data. Startup opens/migrates a store before starting daily backups; the curriculum CLI does take a pre-import backup, but there is no general automatic pre-migration recovery gate.
- Why it matters: a single machine/storage failure can remove both records and local snapshots. Untested deployment migrations need a recovery point before any schema upgrade.
- Files: `server/backup.js`, `server/db.js`, `server/http.js`, `server/import-curriculum.js`, `README.md`.
- Required work: school-approved off-device storage and retention, a pre-upgrade backup/rollback procedure, failure alert ownership and a timed recovery exercise. Do not upload real records or select retention periods without approval. A local restore succeeded during this audit; that is not an off-device disaster-recovery test.

### P1 - High priority

**AUD-04 - Concurrent Department Head setup could overwrite the first password. Fixed.**

- Evidence: the new test failed before the patch with two HTTP 200 responses. The API checked configuration before asynchronous hashing, then used an upsert.
- Why it matters: first-use setup could violate the documented requirement that existing credentials change only through verified recovery. The route already required Registrar access; this was not anonymous privilege escalation.
- Files: `server/http.js`, `server/db.js`, `server/auth.test.js`.
- Implementation: initial creation uses an insert-only database transaction. One concurrent request succeeds; the other returns 409. Existing credential hashes remain intact. Schema and recovery authority are unchanged.

**AUD-05 - The client rejected valid classes in disjoint academic date ranges. Fixed.**

- Evidence: client draft selection compared weekday/time only, while server conflict rules also considered academic dates. Tests now show that sequential short courses can be offered together and real overlaps still roll back atomically.
- Why it matters: staff could be blocked before reaching a valid server operation.
- Files: `app.js`, `schedule-rules.js`, `server/schedule-rules.test.js`.
- Implementation: client checks now use the same half-open meeting times and inclusive academic date ranges as the server. Unspecified ranges still mean the whole term. The server remains authoritative.

**AUD-06 - The full staff snapshot misses the representative performance target. Partially improved; still open.**

- Evidence: 50 simultaneous requests with 480 fictional students originally measured about 4,469 ms p95 for `/data` and 3,923 ms for `/reports`. The final separate-process snapshot benchmark measured 4,053 ms for `/data` (fail) and 1,232 ms for `/reports` (pass), against 3,000 ms. These are local observations, not production guarantees.
- Why it matters: `/data` transfers about 2.85 MB uncompressed, including 10,936 evaluated results and 10,872 completion records. Every workspace bootstrap fetches this data regardless of the page.
- Files: `server/db.js`, `server/http.js`, `app.js`, `server/load-practice-check.js`, `package.json`.
- Implemented: batch home-block and class-label reads; reuse curriculum data across block schedules; read only the needed student directory for reports/history instead of loading the whole workspace; batch program-specific result titles; negotiate gzip for large JSON with `no-store` retained. Before/after data, report/filter and audit responses matched exactly for Registrar and Department Head on a private copy of the fictional fixture.
- Next fix: introduce compatible paginated directory and report reads and fetch individual evaluation data only when needed. Keep existing response contracts available during the transition. Benchmark again with realistic plans/history and a browser; do not add a shared private-data cache merely to pass the benchmark.

**AUD-07 - One login counter applies to every account, including successful logins. Open.**

- Evidence: `server/http.js` increments one server-wide counter before each password check and blocks after five attempts per minute; current tests verify that shared behavior.
- Why it matters: a busy enrollment period can lock out unrelated legitimate users. Public account/status/recovery endpoints also need abuse controls before Internet exposure.
- Files: `server/http.js`, `server/auth.test.js`.
- Required work: design bounded per-account/client limits plus a server-wide resource ceiling, using a trusted-proxy/IP policy appropriate to the selected host. Add fairness, concurrency and recovery tests. No limiter was weakened during this audit.

**AUD-08 - General class corrections are not an implemented workflow. Open.**

- Evidence: staff can create class offerings and link them to blocks; no class update/delete HTTP routes exist. Published offers deliberately remain read-only.
- Why it matters: a mistaken time/room must be corrected through a controlled process rather than direct database edits or duplicate classes.
- Files: `app.js`, `server/http.js`, `server/db.js`.
- Required work: define and build draft-only corrections with the same conflict/capacity checks, audit records and guards against referenced classes. Separately agree how a published schedule is withdrawn, corrected and accepted again. Do not silently edit a student's accepted schedule.

**AUD-09 - Only BSIT and BSCS have supplied subject curricula. Open for broader rollout.**

- Evidence: the main catalog contains 49 BSIT and 51 BSCS entries; the public directory lists 13 programs.
- Why it matters: the two supplied curricula are sufficient for the agreed demonstration, but registration for another program does not supply its subject rules or class offerings.
- Files: `institution.js`, `curriculum/plp-2022.js`, `server/db.js`, `docs/curriculum-sources.md`.
- Required work: confirm deployment program scope and obtain school-verified catalogs and intake applicability for additional programs. Do not invent subjects or claim that a 2022 source is approved for a later intake.

### P2 - Medium priority

**AUD-10 - Student and section searches contaminated each other. Fixed.**

- Evidence: both directories used a single `query` variable. A student-name filter could cause the section directory to appear empty.
- Files: `app.js`.
- Implementation: remember each directory's query separately while keeping current history behavior. Live checks entered `Learner 01` for students and `1A` for sections; switching back restored the correct values and initially opening Sections showed all 16 fictional groups.

**AUD-11 - Older staff forms lacked submission guards and visible progress. Fixed for the four affected forms.**

- Evidence: staff login, term creation, student record and class creation used older submit handlers outside the existing busy helper.
- Files: `app.js`.
- Implementation: reuse `submitWorkflow`, expose `aria-busy`, disable submission and show Please wait while the operation runs, then restore the button on failure. Browser sign-in verified the loading label, busy attribute and disabled button. Server uniqueness/transaction guards remain necessary.

**AUD-12 - Validation errors could be offscreen and duplicate catalog names exposed database wording. Fixed.**

- Evidence: a duplicate-room submission left its error at -2,168 px relative to the viewport while the user remained at the form. It retained the input but looked as if nothing happened.
- Files: `app.js`, `server/db.js`, `server/evaluation.test.js`.
- Implementation: focus/scroll the error notice without rerendering the form; return a clear 409 for duplicate room/professor names, including case/whitespace variants. Live retest placed the error at 96 px, focused the alert, preserved the entered value and re-enabled submission. No room was added.

**AUD-13 - Main and practice sessions shared one localhost cookie name. Fixed.**

- Evidence: browsers scope cookies by host/path rather than port. The regression test failed before the patch when signing into the practice instance replaced the main cookie.
- Why it matters: opening the isolated practice server could make the main app appear signed out.
- Files: `server/http.js`, `server/auth.test.js`.
- Implementation: practice uses `registrar_practice_session`; the main application keeps its existing name. Both sessions survive independently, and practice logout leaves main signed in. Practice needs sign-in again after this change; passwords and records do not change.

**AUD-14 - Staff session-expiry and uncertain network-write recovery need a clearer UX. Open.**

- Evidence: the student refresh path handles 401 by showing sign-in; staff `api()` generally throws a message and leaves the workspace displayed. A write followed by a failed refresh can be reported as an error even if the write committed.
- Files: `app.js`, `student.js`, `server/http.js`.
- Required work: a role-bound reauthentication flow that preserves permitted non-password drafts, clears sensitive recovery data and never retries a write blindly. Add tests for expired sessions, lost write responses, changed roles and browser history. Do not persist passwords or consent.

**AUD-15 - Error pages and operational diagnostics are basic. Open.**

- Evidence: static missing paths return Build the app with npm run build first even when a build exists; server errors/backups use generic console messages without an operational health view.
- Files: `server/http.js`, `server/backup.js`.
- Required work: honest 404/503 responses with working return links, privacy-safe request identifiers, health checks and an agreed alert destination. Keep student details, passwords and token values out of logs.

**AUD-16 - Browser/accessibility acceptance and scalable read coverage are incomplete. Open verification gate.**

- Evidence: all fourteen staff destinations opened with expected headings/active links; the checked visible controls had labels and no duplicate IDs, and phone/tablet pages contained horizontal overflow. These checks are not a WCAG audit. Automated tests mainly cover backend/business rules.
- Files: frontend pages/scripts/styles, `package.json`, test scripts.
- Required work: repeatable browser smoke coverage for registration, retake decisions, publishing, stale offers and role switching; Firefox/Edge/mobile and assistive-technology testing; focus/contrast/reduced-motion/print acceptance; realistic disk/network/browser and login load tests. Do not infer broad compliance from a few screenshots.

### P3 - Low priority

**AUD-17 - Legacy helper and accumulated presentation overrides need a separate cleanup. Open.**

- Evidence: `student-numbers.js` contains a legacy browser-number migration helper not imported by the current app entry points; the frontend styles span several override files.
- Why it matters: future maintainers can confuse old browser behavior with the server-owned number generator, and overlapping styles are harder to change safely.
- Files: `student-numbers.js`, `styles.css`, `ui-refresh.css`, `plp.css`, `navigation.css`.
- Required work: document any external legacy consumer before retiring the helper, then consolidate proven duplicate rules with visual regression checks. This audit did not delete compatibility code or redesign working screens.

## Prioritized development sequence

1. Complete paginated/on-demand staff reads (AUD-06), preserving compatibility and permission tests; require the representative 50-user check to pass.
2. Agree on production identity, bootstrap, session storage and abuse controls (AUD-02/AUD-07), then implement them against the chosen hosting model.
3. Establish pre-upgrade and off-device recovery with a responsible operator and timed restore (AUD-03).
4. Confirm program/intake scope and obtain missing approved catalogs (AUD-09).
5. Define draft class corrections and published-offer revision policy (AUD-08); build with audit and student-consent safeguards.
6. Finish reauthentication/network recovery, operational errors and browser/accessibility acceptance (AUD-14 to AUD-16).
7. Perform the optional legacy/CSS cleanup after the functional and release gates pass (AUD-17).

Items 2-4 can be planned in parallel, but Internet exposure remains blocked until their applicable gates pass. This sequence is an engineering roadmap, not permission to upload student records or publish the app.

## QA evidence and remaining limits

| Check | Result |
| --- | --- |
| Automated suite | 72 tests passed after this update |
| Frontend build | Passed |
| npm advisory audit | Zero known vulnerabilities reported for the installed dependency tree on 20 October 2026; not proof of vulnerability-free code |
| Main and practice database integrity | Both schema version 10; integrity checks OK; zero foreign-key errors |
| Main recovery exercise | New backup and separate restored copy passed; counts matched across eight core tables; live database not overwritten |
| Read-response compatibility | Full data, reports with filters and audit output matched the pre-change implementation for both staff roles on a private fictional-data snapshot |
| Staff page checks | Fourteen destinations opened with correct headings/active links; no duplicate IDs or unlabelled visible fields found in the inspected states; no console errors |
| Interaction checks | Busy sign-in; separate/restored searches; duplicate room validation with visible focused error and retained form values; mobile drawer selection/dismissal |
| Responsive checks | Staff at desktop, 390 px and 820 px; no document-wide horizontal overflow in the inspected states |
| Small load smoke | 50 concurrent registrations, staff data and reports on 50 in-memory samples passed earlier in this audit; excludes browser/login/disk/production network |
| Representative load | 480 fictional students, 50 concurrent reads: data p95 4,053 ms (fail), reports 1,232 ms (pass); separate server/client processes on a snapshot, warm reads |

Reproduce normal checks with `npm test`, `npm run build` and `npm audit`. Run `npm run test:load` for the small smoke test. Run `npm run test:load:practice` for the larger check after preparing the documented 480-student practice fixture; it copies that database to a temporary location and never resets a live database. The larger check deliberately exits nonzero while any p95 target is missed. Filesystem hard-link support and the practice fixture's existing documented credentials are required. A current performance failure must not be hidden by quoting only the small smoke result.

## Recommended next task

Replace the all-record staff bootstrap with paginated directories and per-student evaluation reads, with a compatible transition for existing routes. This directly addresses the measured remaining failure and reduces unnecessary transfer of personal records. Production deployment must remain gated by identity, recovery and school approval decisions.
