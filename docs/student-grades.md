# Student grades — 20 October 2026

## Student journey

Sign in to the student portal, then select **My grades** beside the enrollment shortcuts. The page is also available at `/student.html?view=grades` after sign-in. **My enrollment** returns to the existing offer and timetable workflow.

The page lists curriculum subjects for Years 1–4, grouped by semester. Summer remains separate. The year dropdown filters immediately without an Apply button. Each subject shows units, recorded raw percentage, transmuted grade and Passed / Failed / Not taken. Program-specific subject titles and curriculum sources are preserved. Results outside the current program curriculum appear separately rather than disappearing.

No new grade records are created by viewing this page. A missing numeric grade appears as a dash. Verified legacy completion can show Passed without a numeric grade. Not taken indicates no evaluated result, not a fabricated failing grade. Students request corrections from the Registrar through the existing school process.

## Scope and permissions

`GET /api/me/grades` and `/api/v1/me/grades` use the existing student session identity. Anonymous callers receive 401; staff roles receive 403. Client-supplied student IDs cannot select another person's records. Queries read only the current student's results and program curriculum, without the full staff snapshot or staff evaluation response.

The existing database stores one current evaluated result per student and subject. This page is **not an official transcript or a full history of attempts**. It does not infer term dates from curriculum year, calculate an unconfirmed GWA, invent missing grades, or change prerequisite decisions. No schema migration is required.

## Video reference

Reviewed the supplied 25-second reference video. It shows a split sign-in screen, a collapsible staff sidebar, an enrollment queue, applicant status labels and pagination, searchable scheduling, an audit activity list, and program settings.

The current application already has protected sign-in, a collapsible sidebar, a paged task queue, record searches, scheduling filters and audit history. Preserve those working features. Admissions document validation, announcements and scholarship eligibility require agreed school requirements before implementation; the video alone does not establish those requirements. No example status or university policy from the video was copied into real records.

## Verification

Focused tests cover four curriculum years, Summer, own-record isolation, both API prefixes, all role boundaries, raw/transmuted grades, blank legacy grades, missing results, program-specific titles, other recorded subjects, and reads leaving evaluation unchanged. Browser checks use fictional practice records; screenshots and the supplied video remain outside Git.

Verification completed: all 74 automated tests passed and the production build passed. Browser checks confirmed the dashboard shortcut, direct grade-page reload, instant year filtering, separate Summer grouping, return to enrollment, browser Back, and mobile grade rows at 390px without horizontal page overflow. No browser console errors were recorded during these checks.
