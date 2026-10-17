# PLP Enrollment System — current-progress demonstration

Main local application · 17 October 2026

## 1. Prepare before presenting

- Run `npm run dev` in the project folder. Open the main application at **http://localhost:5173/**. This walkthrough does not use the separate practice application on port 3004.
- Keep three browser tabs ready: the homepage, `/staff.html`, and `/student.html?view=login`.
- Have your existing Registrar and Department Head passwords ready. Do not display passwords during the presentation. The fictional student example uses ID **26-00006**; its password was supplied in the project chat.
- Use fictional records for demonstrations. Avoid projecting personal details from other records.
- Sign out before switching staff roles. Refresh the student portal after staff updates. A completed demonstration changes its record; repeat the presentation from the record's actual current state.
- Check that the active term is **2026–2027 · Semester 1** and the BSIT 1A timetable has all seven subjects.

Suggested duration: **10–15 minutes**.

## 2. Opening statement — 30 seconds

> “This is our current PLP Enrollment System. It manages student registration, permanent IDs, curriculum requirements, block sections, scheduling, and enrollment approval. Students review an offer and accept or decline it. The Registrar confirms accepted enrollments. Special cases pass through Department Head evaluation.”

State that the application currently runs locally with Node.js and SQLite. The code is on GitHub. Online deployment is still pending its hosted database setup.

## 3. Show the public entry — 1 minute

**Open:** the homepage, then Student sign in.

**Show:** the enrollment entry points, colleges/programs, registration, and sign-in.

**Explain:** students can register without an account; the system generates their permanent Student ID. A password is needed to view schedules and respond to offers. Registration alone does not confirm enrollment.

If demonstrating registration, use a new fictional name and unique `@example.test` email. Record the generated ID from the receipt. Reuse that existing record afterward; do not register it again. First-password setup is a separate step.

## 4. Registrar workspace and sections — 2 minutes

**Sign in:** Registrar → Sections.

**Show:** one row per group, with only **Section** and **Students**. Open **BSIT 1A**.

**Inside the section:**

1. Show the seven curriculum subjects, their meeting times, rooms, and professors.
2. Open Students to show the home-block roster and actual member count.
3. Open Transfer history to show recorded membership changes.

> “The directory counts students assigned to the block; it does not add up seven subject enrollments as seven different students. The block group stays with a student across year levels. Only the Registrar can transfer their membership, with a recorded reason.”

Show Rooms & professors briefly: rooms **601–610**, **Lab 1–Lab 4**, and the example professor catalog. These are demonstration resources, not a verified PLP staff directory or official timetable.

## 5. Curriculum and automatic filtering — 1 minute

**Open:** Curriculum.

1. Select **BS Information Technology**. The results update immediately.
2. Select **2nd year** and **Semester 1**. No Apply filters button is needed.
3. Point to COMP 104, COMP 105, IT 201, and IT 202: each requires **COMP 103**.
4. Switch to BS Computer Science to show the second supplied curriculum.

> “Prerequisites come from the selected curriculum. Staff do not retype them when scheduling a class. The server checks completed requirements before allowing an assignment.”

The supplied catalogs are the 2022–2023 versions: BSIT **49 entries / 146 units**, BSCS **51 / 146**. Summer remains separate. Other listed programs do not yet have supplied subject curricula.

## 6. Regular enrollment — 2 minutes

The current main record **26-00005** has accepted a seven-subject offer and is awaiting Registrar confirmation. Use it to show the final part of the workflow:

1. Registrar → Enrollment → find **26-00005**.
2. Show the accepted, read-only offer and complete timetable.
3. Explain that the student has already accepted it.
4. During the demonstration, use Confirm accepted enrollment to finish it if you intend to finalize this example.
5. Show its updated status in Reports. The section is displayed as **BSIT 1A**, not internal `SEC-...` class IDs.

For a complete fresh regular workflow, use the fictional first-year record created in step 3:

1. Registrar reviews its details and confirms registration.
2. Registrar assigns its home block to BSIT 1A through Sections → BSIT 1A → Students.
3. Enrollment → select the student → Review and publish block offer.
4. Student signs in, checks all subjects, and accepts the complete offer.
5. Registrar confirms the accepted enrollment.

> “A home-block assignment identifies the student's group. A published offer is what makes the schedule available to that student. Acceptance and Registrar confirmation are separate steps.”

Declining an offer releases its reserved seats. Demonstrate that with a separate fictional record if needed; it cannot be shown on an already accepted or confirmed offer.

## 7. Failed prerequisite / irregular student — 3–4 minutes

**Use:** **26-00006 — Example Backsubject**, BSIT 2D, second year.

### A. Show the academic evidence

Registrar → Individual evaluation → select **26-00006**.

- **COMP 103 — Intermediate Programming (Java): Failed.**
- **COMP 104, COMP 105, IT 201, IT 202:** not taken and blocked by failed COMP 103.
- Other first-year credits in this fictional record are passed.

Explain that authorized Registrar staff can encode results manually or import a validated CSV. This is an evaluated-results record, not a complete transcript or an automatic connection to a university grading system.

### B. Show the student's notification

Open the student portal and sign in as **26-00006**.

- The retake dialog opens when an unresolved failed-subject decision is first shown in the tab.
- “Subjects you cannot take yet” lists the four blocked subjects and the failed prerequisite.
- The same notice remains on the page after closing the dialog. Review retake choices reopens it.
- The student can request **COMP 103** again or explicitly defer it. They cannot select the blocked dependent subjects as their own enrollment choices.

For the retake path, check COMP 103 and submit the request. Leaving it unchecked and submitting Defer all is a real deferral; simply closing the dialog saves no decision.

### C. Department Head evaluation

Sign out of staff, then sign in as Department Head.

1. Find the example under Individual evaluation / Subject assignments.
2. Show the student's saved retake decision.
3. Approve **COMP 103** if requested. Its prerequisite, COMP 102, is already passed in this example.
4. Show that COMP 104, COMP 105, IT 201, and IT 202 cannot be approved while COMP 103 is failed.

> “Choosing to retake a failed subject does not count as passing it. The prerequisite stays blocked until the Registrar records a verified passing result.”

### D. Registrar scheduling and confirmation

1. Sign back in as Registrar.
2. Enrollment → **26-00006** → choose the available **COMP 103 · RETAKE** offering.
3. Check its room, professor, day and time, then publish the offer.
4. Student refreshes the portal, accepts or declines.
5. Registrar confirms an accepted offer.

The student keeps BSIT 2D as their home block even when an approved retake uses a different class offering. Do not edit grades supporting a published offer during this demonstration; those records are deliberately protected.

Notifications here are **inside the student portal**, not email or SMS.

## 8. Conflict checks and reports — 1–2 minutes

**Conflict checks:** while adding a curriculum class, try an existing block time, room time, or professor time. The server rejects overlapping meetings. An adjoining meeting beginning exactly when another ends is allowed. Check AM/PM carefully: a saved 4:00 AM–7:00 PM meeting really occupies that entire interval.

Do not save an intentionally incorrect timetable just for the presentation. Explain that class capacity cannot exceed room capacity, and offers cannot reserve seats beyond capacity.

**Reports:** filter by term, program, or enrollment status; results update immediately. Download CSV to show the same selection. Show Audit history for recorded staff actions.

Account recovery is Registrar-assisted for students and Department Heads, with an identity-verification reference. Use a fictional account if demonstrating it; the reset genuinely replaces that account's password.

## 9. Current progress and remaining work — closing

**Working and verified:** registration and IDs; role access; student records; supplied BSIT/BSCS curricula; permanent sections; scheduling and conflict checks; academic evaluation; retake decisions; Department Head approval; student response; Registrar confirmation; reports; audit history; and local backups.

At preparation time, the main database had **6 students**, **4 permanent groups**, a complete BSIT 1A timetable, 14 rooms, and 28 example professors. BSCS 1A and BSIT 2D do not yet have complete block timetables. These counts will change as you demonstrate the system.

**Still pending:** online hosting/database migration, school verification of data and procedures, complete timetables for other groups, and user acceptance testing. No tuition or payment module, attendance, LMS, email/SMS delivery, or automatic year-level promotion is included.

Verification for this update: **62 automated tests passed**, frontend build passed, and the section directory, immediate curriculum filters, roster navigation, and owning-student prerequisite notification were checked in the browser.

Close with:

> “Our current progress demonstrates the complete enrollment approval flow and the rules that protect it. The next work is completing verified school data, testing with intended users, and finishing online deployment.”
