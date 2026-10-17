# Solution design criteria and evidence

Reference: supplied Solution Design Document v0.1, 16 October 2026, BSIT3B. The user selected the existing Node.js/SQLite stack. This supersedes the draft's Laravel/MariaDB choice; it does not claim those technologies are installed.

## Functional traceability

| Requirement | Implementation and verification |
| --- | --- |
| FR-01 | Public registration includes identity, contact, program, year, semester and type; optional password. Registration API tests. |
| FR-02 | Server validation and duplicate email/name/birth checks; profile edits check duplicates. Database tests. |
| FR-03 | Immutable student number separate from internal primary key; annual UTC+8 `YY-00001` sequence and unique constraint. Number and rollover tests. |
| FR-04 | Curriculum maps program/year 1–4/semester 1–2, units and prerequisites. Catalog screen and tests. Official school content must be supplied. |
| FR-05 | Registrar assigns regular subjects matching program, year and active semester. Ownership and eligibility tests. |
| FR-06 | Department Head assigns special subjects; Registrar cannot bypass ownership by offering an unassigned schedule. Special workflow tests. |
| FR-07 | Prerequisites, completed subjects, availability and curriculum checked at assignment and offer; cycles blocked. Database tests. |
| FR-08 | Registrar sets weekday, times, instructor, room and optional date range, then offers matching sections. Schedule validation tests. |
| FR-09 | Server blocks student, room and instructor overlaps; failed offers roll back. Conflict and atomicity tests. |
| FR-10 | Offers reserve seats in immediate transactions. Parallel last-seat and decline-release tests. |
| FR-11 | Student only accepts/declines own complete current offer; stale revisions rejected. Role and response tests. |
| FR-12 | Draft → pending → accepted → confirmed, or pending → declined; Registrar confirms acceptance; student sees confirmation. State/idempotency tests. |
| FR-13 | Three roles with server sessions and API enforcement; scoped records. Auth, isolation and expiry tests. |
| FR-14 | Filtered reports and CSV export with spreadsheet formula escaping. Reports/API tests. |
| FR-15 | Signed-in student sees own ID, schedule list, timetable, status and term history. Own-record tests and student UI. |
| FR-16 | Department Head sees special students and scoped action history. Scoped history tests. |

Public registration remains available under project instructions. Student login is required for schedules and responses. First-use ID/email/birth account setup is a localhost convenience, not verified recovery for shared deployment.

## Non-functional acceptance

| Requirement | Evidence and remaining gate |
| --- | --- |
| NFR-01: 99% availability | Requires hosting, service owner, uptime window and observation; not established by a local build. |
| NFR-02: p95 <3 s at 50 users | Repeatable local API load check provided; results apply to its dataset, endpoints and machine. Full enrollment-period browser/load acceptance remains pending. |
| NFR-03: 3× students | Confirm baseline volume, representative dataset and hardware before acceptance. |
| NFR-04: security | Bcrypt for new passwords, legacy scrypt verification; role checks, login throttling, HttpOnly/SameSite cookies, mutation header checks, eight-hour inactivity timeout. HTTPS required beyond localhost. |
| NFR-05: privacy | Notice/acknowledgment timestamp, limited public lookup, scoped special records, no password exposure. School notice, lawful basis, retention and privacy review require approval. No legal compliance certification is claimed. |
| NFR-06: recovery | Daily verified local snapshots while running; manual backup/restore-copy commands; automated WAL-safe recovery test. Off-device retention and timed RPO/RTO exercise remain pending. |
| NFR-07: usability | Responsive academic ledger shell, labels, keyboard controls and themed jQuery UI. Full Chrome/Edge/Firefox UAT remains a school acceptance check. |
| NFR-08: auditability | Actor/action/entity/time for record changes, assignments, offers, responses and confirmations. School must define retention `[n]` years and audit access policy. |
| NFR-09: integrity | Foreign keys, unique numbers, one plan/student/term, unique assigned subjects, transactional reservations, duplicate subject/conflict checks and transition guards. |

## Architecture and API mapping

| Draft component | Chosen implementation |
| --- | --- |
| Laravel/PHP/Apache | Node 24 HTTP server bound to 127.0.0.1 |
| MariaDB/Eloquent | Built-in SQLite, numbered migrations, prepared statements and transactions |
| Blade/Bootstrap | Existing Vite, vanilla JavaScript, jQuery UI and academic ledger CSS |
| Sanctum bearer tokens | Server sessions in HttpOnly cookies, scoped by role and student ID |
| `/api/v1` | Versioned prefix supported; `/api` retained for compatibility |

| Endpoint under `/api/v1` | Authority and purpose |
| --- | --- |
| `GET /auth/status`; `POST /auth/setup`, `/auth/login`, `/auth/logout` | Setup, role sign-in and logout |
| `POST /public/register`, `/public/student`, `/public/account` | Registration, limited review lookup, first account setup |
| `GET /me`; `POST /me/respond` | Student own schedule and response with revision |
| `GET /data` | Staff records; Department Head special cases only |
| `POST /students`; `PUT /students/{number}`; `POST /students/{number}/review` | Registrar record management |
| `POST /students/{number}/completed-subjects` | Registrar records verified completion |
| `POST /curriculum`, `/sections`, `/terms`, `/terms/{id}/activate` | Registrar catalog and scheduling |
| `POST /assignments` | Registrar regular subjects; Department Head special subjects |
| `POST /enrollments/offer` | Registrar offers complete schedule |
| `POST /enrollments/{studentNumber}/confirm` | Registrar confirms accepted offer |
| `GET /reports?term=&program=&status=&format=csv`; `GET /audit` | Staff reports/export and scoped history |
| `POST /staff/department-head` | Registrar configures Department Head access once |
| `GET /evaluation/{number}` | Registrar / scoped Department Head individual report, results and automatic eligibility |
| `POST /students/{number}/results` | Registrar manual / CSV results in one transaction; grade conversion and remark validation |
| `POST /me/back-subjects` | Owning student chooses failed-subject retakes or defers them before approval |
| `POST /resources` | Registrar adds rooms and professors for schedule selection |
| `POST /recovery`; `POST /public/reset-password` | Registrar verifies student / Department Head identity; recipient redeems a hashed, expiring, single-use token |

Validation uses 422, missing login 401, wrong role 403, and allocation/state conflicts 409. Response/confirmation retries do not duplicate transitions. Legacy `/enrollments/confirm` publishes a pending offer and cannot bypass student acceptance. Imported legacy allocations are preserved as confirmed history, explicitly marked `legacy:registrar` rather than fabricating student acceptance.

## Demo acceptance sequence

1. Configure both staff passwords; enter approved curriculum and available sections.
2. Register regular and special students with sample identities; review and verify classification as Registrar.
3. Check Department Head cannot retrieve regular records or create schedules, and Registrar cannot assign special subjects.
4. Assign with the responsible role; Registrar publishes complete section offers.
5. Sign in as the first student, inspect the offer and accept; Registrar confirms; student sees confirmation.
6. Second student declines; verify seats release and Department Head can prepare a replacement special assignment.
7. Attempt overlap, duplicate subject, wrong role, stale response and concurrent last-seat requests; verify no partial allocation.
8. Filter/export reports, inspect actors in history, and restore a checked backup to a separate database.

## Inputs for professor approval

School name, actual programs/official curriculum, professor/document owner, dates, volume baseline, approved privacy notice and retention, production account verification/recovery, hosting, off-device backup/restore process, browser/UAT evidence, architecture diagram and final sign-off. These inputs cannot be inferred from sample data or marked approved by code alone.

## Verification record — 16 October 2026

- `npm test`: 27 checks passed, including both API prefixes, all three roles, session expiry/revocation, bcrypt and legacy passwords, state guards, concurrent last-seat requests, WAL-safe recovery, year rollover and version 4 migration preservation.
- `npm run build`: successful Vite production build.
- `npm run test:load`: 50 simultaneous requests per endpoint; local p95 registration 85 ms, staff data 67 ms, reports 107 ms. In-memory sample database with 50 students, excluding login, browser rendering, disk load and production network latency.
- Browser smoke check against a separate in-memory database: staff sign-in, curriculum, pending report, student schedule list and timetable, accept dialog, accepted state, registrar confirmation dialog and confirmed state. Narrow student view checked at 390 px with contained table scrolling. This is not full cross-browser school UAT.

## Additional confirmed workflow

The student back-subject decision occurs after Registrar review and before Department Head subject approval. A retake decision never satisfies a prerequisite. Explicit Passed results satisfy it; Failed and Not taken do not. Only the Registrar schedules and confirms. Raw grade conversion follows the table supplied by the user; result remarks are limited to Passed, Failed and Not taken.

The isolated practice instance includes two synthetic BSIT students and two example sections. It preserves its state on restart and never seeds the main database. School-approved curriculum, result evidence, identity verification, full transcript history and production rollout remain separate acceptance inputs.

## Supplied curriculum evidence

The user supplied scanned BSIT and BSCS 2022–2023 curricula. All four pages were reviewed; the transcription includes BSIT 49 subjects / 146 units and BSCS 51 / 146, subject prerequisites, year-standing checks, and separately labeled Summer entries. Original PDFs are available from the Curriculum screen. Automated tests verify semester totals, complete prerequisite references, standing enforcement, atomic/idempotent imports and protection against unrelated historical sections with reused codes. These source versions do not establish curriculum approval for a newer intake.
