# Expanded block practice

Open http://localhost:3004/staff.html?view=blocks after `npm run build` and `npm run practice`. This instance uses `data/practice-blocks.sqlite`. It never seeds the main database or the earlier `data/practice.sqlite`.

## Accounts

| Role | Password |
|---|---|
| Registrar | `PracticeRegistrar2026!` |
| Department Head | `PracticeHead2026!` |
| Every fictional student | `PracticeStudent2026!` |

The first two accounts are `26-00001` (regular) and `26-00002` (back subjects), both in BSIT 1A for a seed created in 2026. IDs use the actual record-creation year, so inspect the practice workspace for IDs if seeded in a later year. Their emails are `example.regular@example.test` and `example.irregular@example.test`. Other IDs and classifications are in each block's Students tab. These are fictional records; names and addresses deliberately identify examples.

## Dataset

- Sixteen BSIT groups: 1A–1D, 2A–2D, 3A–3D, 4A–4D; 15 initial members and 30 places each. The other 240 fictional students remain unassigned so they can be added during the demonstration.
- Every group has 24 regular learners, four with failed subjects, one transferee and one returning learner: 480 total.
- Each group's Semester 1 subjects come from the supplied 2022–2023 BSIT curriculum. This is a demonstration source, not a statement that it is approved for a later intake.
- 100 block classes plus three Friday retake offerings for COMP 103, IT 104 and IT 111. COMP 102 retakes use available first-year block classes.
- Synthetic prior credits are evaluated records, not a complete transcript of attempts. Failed prerequisite descendants remain Not taken. Grades and standing checks are enforced normally.
- Each block and example class holds up to 30 learners; each room holds 40. Available places allow guest classes and transfers. Each example class has one one-hour meeting; this demonstrates allocation and conflict checks, not an official university timetable or full contact-hour plan.
- The resource catalog includes rooms 601–610, Lab 1–Lab 4, and 28 fictional named professors. New seed schedules use rooms 601–604 for general classes and Lab 1–Lab 4 for computing classes; other rooms remain available for scheduling. Faculty names are examples, not a PLP staff directory.
- `node server/update-practice-resources.js` updates the earlier expanded example safely: it takes a verified backup, adds the requested rooms and replaces generic resource names only on unpublished example classes. Published schedules and their original resource names remain unchanged. It checks schedule conflicts before committing and never targets the main database.
- No offers are seeded; staff and students can perform the enrollment workflow themselves. In the current local instance, fictional student `26-00003` has one confirmed seven-class offer from the live verification walkthrough; `26-00001` and `26-00002` are ready for your own walkthrough. Restarting preserves progress. An incomplete initial seed stops rather than resetting records.

## Regular workflow

1. Sign in as Registrar. Open Blocks, then Manage block for BSIT A, 2026 intake.
2. Check the timetable and Students (15). Select Review offer for a regular learner.
3. Review and publish the block offer. All applicable unpassed subjects are included together; prerequisites, standing, capacity and conflicts are checked on the server.
4. In a separate student portal, sign in with that student ID and the student password. Accept or decline the offer.
5. Return to Registrar and refresh Enrollment. Confirm an accepted offer.

## Irregular workflow

1. Registrar opens Individual evaluation for `26-00002`: COMP 102 is Failed; COMP 103 cannot be assigned until its prerequisite is passed.
2. Student signs in and chooses to take COMP 102 again, or defers it.
3. Sign out of staff and sign in as Department Head. Review the evaluation and approve eligible selected subjects. A deferred failed subject cannot be assigned.
4. Sign back in as Registrar. Select an available COMP 102 class (a different block may be chosen if there is space). Publish the schedule.
5. Student accepts or declines; Registrar confirms acceptance. The home block remains 1A even when the class is in 1B.

## Permanent membership

Registrar can assign/transfer a reviewed active student in a block's Students tab. Transfers require a reason and are recorded under Transfer history. Published offers prevent transfers in that term. Use a new term before changing the year level of a student whose current plan is published. The membership identity remains the same; only the displayed year changes, for example BSIT 1A → 2A. Registrar prepares the group's new timetable for that term. Year-level progression is an explicit Registrar action, not automatic promotion.

The old two-student example remains available using `npm run practice:small`. Both commands use port 3004, so run only one at a time. Daily verified backups have a separate filename prefix for each source database.
