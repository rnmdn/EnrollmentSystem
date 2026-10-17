# UX audit implementation — PLP enrollment demonstration

Date: 17 October 2026. Scope: local Node/SQLite application; existing PLP green and academic ledger identity retained.

## Changes against the ten findings

| Finding | Implemented response | Remaining limit |
| --- | --- | --- |
| Registration details lost on navigation | Non-password details survive student portal navigation and Back/Forward in the same tab. Clear form requires confirmation; leaving a dirty page warns. | Drafts are memory only and do not survive closing or reloading the page. Passwords and consent are never restored. |
| Forgotten credentials or ID lead to a dead end | Help & recovery route from header, sign-in, status and registration explains Registrar-assisted recovery and existing-record lookup. | No online reset; school must approve identity verification and recovery ownership. |
| Published offer looks empty to staff | Pending, accepted and confirmed plans show a read-only published timetable and subject/section list. Accepted plans expose Registrar confirmation. | Changes require the existing server workflow; confirmed schedules cannot be silently edited. |
| Waiting states lack guidance | Progress stages, next responsible role, concrete next action and actual update timestamp accompany the student status. | No invented deadline, processing SLA or expiry rule. |
| Registration term and classification are confusing | Active term is read only; server binds submissions to it and records the Manila submission date. Classification descriptions explain each option and direct uncertain cases to staff. | School staff still verify classification. |
| Schedule difficult on phones; workload missing | Mobile subject list includes units, meeting time, room, instructor and dates. Total units and subject count are shown; weekly timetable remains available. Confirmed schedules have print styling and a Print confirmation action. | Physical print output still needs acceptance checking; the demonstration copy is not an official certificate. |
| Staff loses location and filters | Staff URLs retain view, selected ID and non-sensitive filters; search is retained in history state. Back/Forward and reload restore location. Non-password form drafts survive in-app navigation. | Unsaved drafts are cleared on logout, term change or page reload. |
| Official branding obscures prototype status | Academic demonstration / BSIT3B appears in the public and student headers and staff entry; university links identify official sources. | University authorization, privacy notice and production status are not implied. |
| Scroll animation hides meaningful text | Removed scroll opacity reveals, pinned guide and the learning statement. Content and actions are visible immediately. Reduced-motion support and moving-text pause remain. | Physical assistive technology testing remains necessary. |
| Long, repetitive home and heavy image | Compact hero includes active term and primary actions; removed duplicate entry cards and statement section. Four-step guide and vertical FAQ clarify the journey. Converted book image to WebP. | Original image retained for editing; actual production network performance requires deployed measurement. |

## Verification completed

- `npm test`: 33 tests passed, including new active-term/date, units/update metadata and stale-term API tests, plus existing identity, authority, conflicts, capacity, authentication and backup checks.
- `npm run build`: passed.
- Synthetic browser fixture, separate from the real records: registration help navigation, Back restoration, explicit clear confirmation, field error summary, student sign-in, offer acceptance, Registrar task queue, published schedule reload, Registrar confirmation and student confirmed state checked.
- Staff search retained through navigation and Back.
- Homepage program search, clear, FAQ expansion and moving-text pause checked.
- Mobile widths 390 and tablet width 768 checked for document overflow; no document-wide overflow observed. Desktop homepage reviewed at 1280 × 800.
- Student phone layout showed the subject list and 3-unit total for the sample subject. No console warnings/errors observed in the checked pages.
- Hero image: PNG 1,649,899 bytes; WebP 189,516 bytes (about 88.5% smaller).
- Browser fixture contains invented test records and subjects only. No official curriculum is claimed.
- A browser smoke test is not participant usability research, a WCAG certification, a three-browser compatibility assessment, or a production performance result.

## Follow-up roadmap

### Immediate — implemented locally
Prevent lost work during portal navigation; correct published offers; actionable student statuses; active-term validation; clear recovery help; readable mobile schedules; prominent demo identity; visible content.

### Short term — school review and acceptance
1. Registrar validates classification definitions, recovery contact process and printed confirmation wording.
2. Load the approved curriculum, prerequisites and actual academic dates through staff screens.
3. Test the same tasks in Chrome, Edge and Firefox, keyboard only, at 200% zoom, and with NVDA or another supported screen reader. Inspect datepicker/autocomplete announcements, dialog focus return, error links and timetable scrolling.
4. Print a confirmed sample schedule on A4 and review long subject titles, multi-page lists and all columns.
5. Agree processing expectations and offer expiry policy before displaying timing promises.

### Long term — policy and research dependent
- Design verified account recovery with the school's approved identity checks, contact channels and audit requirements.
- Introduce named staff accounts if the school requires individual accountability beyond role-level access.
- Decide who handles stalled or declined cases and whether notifications are required; avoid collecting additional sensitive information without a defined purpose.
- Configure production security, retention, off-device backups and recovery objectives before shared deployment.

## Moderated usability test plan (not yet conducted)

Recruit 5–8 people representing first-time students, returning students, Registrar and Department Head work. Include keyboard and phone users where feasible. Use synthetic data; record no passwords.

| Task | Evidence to collect | Proposed acceptance measure |
| --- | --- | --- |
| Identify where to register versus sign in | First action, mistaken route, participant explanation | Correct route without coaching |
| Register, consult classification help, then return | Lost fields, errors, time, consent understanding | Details retained; participant identifies active term and next step |
| Recover a forgotten ID/password | Duplicate-registration attempts, expectation of reset | Finds help and understands staff verification is required |
| Review and accept an offer on a phone | Missed subjects/units/times, scrolling burden | Correctly explains workload and confirmation still needed |
| Find a pending staff task, inspect a published offer and confirm | Wrong record/action, route loss, confirmation comprehension | Correct student and action without coaching |
| Assign special subjects as Department Head | Role confusion, ineligible selections, handoff understanding | Correct authority and Registrar scheduling handoff |
| Correct errors using keyboard only | Focus visibility/order, error announcement, dead ends | All required actions possible without a pointer |

Report observed completion rate, unassisted completion, critical errors, median time and post-task ease rating. Set realistic time targets after a pilot rather than inventing baseline improvements. Re-test failed tasks after correction; do not replace participant evidence with a visual score.

## Registration handoff refinement

Registration now ends on a dedicated receipt with a read-only permanent ID, Copy Student ID feedback, optional first-password setup and skip-to-status action. Only the ID is prefilled on password setup. Repeated registration explains that the existing ID is reused. Reloading a receipt offers existing-record help without claiming a new submission. No ID or identity details are placed in the receipt URL. Browser checks with an isolated synthetic registration verified receipt creation, copy feedback, ID-only setup prefill, Back, skip and the reload fallback. This local identity check is not email ownership verification.
