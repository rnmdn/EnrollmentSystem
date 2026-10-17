# Practice enrollment walkthrough

This instance contains fictional students and example subjects. It has its own database, credentials, and backups. It is not an approved school curriculum.

## Start

Run `npm run build`, then `npm run practice`. Open **http://127.0.0.1:3004/staff.html?view=practice**. The main instance remains at port 5173 and is not seeded.

| Account | Password |
| --- | --- |
| Registrar | `PracticeRegistrar2026!` |
| Department Head | `PracticeHead2026!` |
| Both fictional students | `PracticeStudent2026!` |

Look up the two permanent student IDs in Students or the Practice enrollment screen. Do not assume these IDs match the main database.

## Examples

- **Example Regular** passed EX101 with grade 2.00. EX102 is eligible because its prerequisite is passed.
- **Example Irregular** failed EX101 with grade 5.00. EX102 is blocked until EX101 is passed. Choosing to retake EX101 does not count as passing it.
- **EX-A** offers EX101 on Monday, 08:00–09:00, Example Room A, Example Professor A.
- **EX-B** offers EX102 on Monday, 09:00–10:00, Example Room B, Example Professor B.

Each section has 20 seats. The application currently models one subject and meeting per section.

## Regular student

1. Sign in as Registrar. Review Example Regular in Individual evaluation.
2. Assign EX102 under Subject assignments.
3. In Enrollment, choose EX-B and publish the offer.
4. Sign out. Sign in through the Student portal with Example Regular's ID and the practice student password.
5. Review and accept the complete offer.
6. Sign out. Sign in as Registrar and confirm the accepted enrollment.

## Irregular student

1. Sign in as Registrar. Open Example Irregular's evaluation. The failed result and the blocked EX102 prerequisite are visible.
2. Sign out. Sign in as Example Irregular in the Student portal.
3. Review the failed-subject dialog. Choose to retake EX101 and confirm that decision. Deferring is also supported; it prevents EX101 assignment for this decision.
4. Sign out. Sign in as Department Head. Open Individual evaluation, then Subject assignments for Example Irregular.
5. Approve EX101 only. EX102 remains blocked by its failed prerequisite.
6. Sign out. Sign in as Registrar and offer EX-A through Enrollment.
7. Sign in as the student to accept. Return as Registrar to confirm. A decline instead releases the reserved seat and allows a revised assignment.

## Results, scheduling and recovery

Use Individual evaluation before publishing an offer to enter a result or preview a CSV. Raw grade 74.49 becomes 5.00 / Failed; 74.50 becomes 3.00 / Passed. Only Passed, Failed and Not taken are available. The report can be printed or saved as PDF through the browser.

Rooms & professors manages the choices used by scheduling. Overlapping student, room or professor schedules, duplicate subjects and overcapacity are rejected by the server. Adjacent meetings are allowed.

Account recovery requires the Registrar to confirm school-approved identity verification and record a reference. A single-use link lets a student or the Department Head choose a replacement password. It expires after 30 minutes; redeeming it revokes that account's existing sessions. It is not automatically emailed. Do not use this process on real records for demonstration.

Practice changes persist across restarts. Running the practice command again preserves existing results, offers, credentials and decisions. It does not reset a completed walkthrough.
