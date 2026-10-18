# PLP Enrollment System - Update Report

18 October 2026 | BSIT3B project team | Application source: `c7a5661`

Screenshot PDF: local output/pdf/PLP Enrollment System Update Report 2026-10-18.pdf. Screenshot assets and the illustrated PDF are excluded from Git. This text version is the repository companion.

## Summary

- **Sections:** A compact directory shows each permanent section and its home-member count. Selecting a section opens its timetable, roster and transfer history.
- **Filtering and reports:** Curriculum and report filters apply on selection. Reports show readable block names instead of internal class offering IDs.
- **Student guidance:** Failed prerequisites produce a focused popup and a persistent notice explaining blocked subjects and the next required action.
- **Navigation:** The Practice enrollment navigation entry and walkthrough page were removed. Isolated practice databases remain available through the CLI.
- **Implementation:** The current application uses Node.js 24, SQLite, Vite, vanilla JavaScript and jQuery UI. The repository is public; this report does not claim a completed Vercel deployment.

## Evidence scope

Figures 1-4 use isolated fictional practice data and the shared application interface. Figures 5-6 use the authorized fictional student in the main database. Screenshot capture date: 18 October 2026. Passwords are omitted. No institutional approval or production readiness is claimed.

## 1. Sections directory

The directory now shows section name and student count only. Select a section to inspect its details; internal subject-level offering IDs do not appear in this directory.

Figure 1. Isolated fictional practice data: section rows with 30 permanent home members each. The Practice mode badge identifies the dataset; Practice enrollment is absent from navigation.

**Reproduce:** Open Registrar workspace > Sections. Select BSIT 1B. The count represents home-block membership, not the sum of subject enrollments.

## 2. Section timetable and detail views

A selected section groups its timetable, student roster and transfer history. Scheduled classes show the subject, units, prerequisite, day, time, room and professor.

Figure 2. Fictional practice section BSIT 1B. The screen reports seven of seven classes scheduled; the viewport shows part of that timetable.

**Reproduce:** Open Sections > BSIT 1B. Review Timetable, Students (30) and Transfer history. Only the Registrar changes home membership; progression changes the year label, not block identity.

## 3. Curriculum filters apply immediately

Program, year level and semester dropdowns update the curriculum immediately. Staff no longer need to click Apply filters, and the selected control retains keyboard focus.

Figure 3. Isolated practice dataset: BS Computer Science, Year 2, Semester 1. Interaction testing returned seven matching subjects; the screenshot shows the filter controls and the visible table rows.

**Reproduce:** Open Curriculum. Select BS Computer Science, Year 2, Semester 1. Confirm seven matching subjects without submitting another button. Summer remains a distinct curriculum semester.

## 4. Readable enrollment reports

Reports use readable block/section labels and remove repeated labels across a student's subjects. Term, program and status filters apply on selection; CSV export uses the selected filters.

Figure 4. Isolated fictional practice record: one confirmed enrollment with seven subjects is displayed under BSIT 1A, rather than seven internal SEC identifiers.

**Reproduce:** Open Reports and select Enrollment confirmed. Confirm the record displays BSIT 1A once in Block / section. The report identifies offered class blocks; an irregular student may take a class in another block.

## 5. Failed-prerequisite popup

Students see the subjects blocked by their failed prerequisite. A retake decision requests a repeat attempt; it does not satisfy the prerequisite or authorize dependent subjects.

Figure 5. Main local database, fictional student 26-00006 (Example Backsubject): COMP 103 blocks COMP 104, COMP 105, IT 201 and IT 202 for the current term.

**Reproduce:** Sign in as the fictional back-subject student. Review the popup and failed subject. The student chooses retake or defer after Registrar review; Department Head evaluation follows. Closing the dialog does not submit a choice.

## 6. Persistent guidance after closing

The dashboard retains prerequisite guidance after the popup is dismissed. It shows the required student decision, next responsible role and last update instead of relying on a one-time warning.

Figure 6. Same fictional main-database record, scrolled dashboard after closing the dialog. The notice remains available; no retake choice or enrollment was changed during screenshot capture.

**Reproduce:** Close the popup. Review the persistent notice and use the retake-choice action when ready. After Department Head approval, the Registrar schedules and publishes; the student responds, then the Registrar confirms.

## Verification and limitations

- **Captured in this report:** Sections directory and section detail views; immediate curriculum filtering (seven BSCS Year 2 / Semester 1 subjects); confirmed-report block label BSIT 1A; prerequisite popup and persistent student guidance.
- **Previous implementation verification:** The implementation verification recorded on 17 October 2026 passed 62 automated tests and the frontend build. These were not rerun for this documentation-only update.
- **Rules remain on the server:** Role authority, verified prerequisites, standing requirements, capacity and schedule conflicts remain mandatory. A closed popup, selected home block or retake request does not bypass approval or publish a schedule.
- **Approval workflow:** Registrar reviews records > student chooses retake/defer for failed subjects > Department Head evaluates and approves special-case subjects > Registrar assigns sections and publishes schedule > student accepts or declines > Registrar confirms an accepted enrollment.
- **Current limits:** Notifications shown here are in-app, not email or SMS. The supplied BSIT/BSCS curricula are the 2022 source versions. Online deployment and its hosted database remain pending; privacy, operational recovery and school acceptance still require completion.
- **Evidence limits:** Screenshots demonstrate visible states. They are not proof of performance, complete accessibility compliance or every permission path. Those need separate testing and institutional review.

## Related files

- `docs/demo-walkthrough.md`
- `docs/curriculum-sources.md`
- `docs/practice-blocks.md`
