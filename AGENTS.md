# Enrollment System: agent instructions

## Project goal

Build a web application for student master records, course and subject scheduling, section allocation, and permanent student ID generation. The local workflow should register a student, create a section, enroll the student, and show the resulting schedule without account creation or sign-in.

## Current architecture

- Use the Node 24 HTTP server and built-in SQLite database in `server/` for the current local application. The frontend is Vite, vanilla JavaScript, and jQuery UI. The original Laravel/PostgreSQL recommendation remains a deployment option, not the current stack.
- The database owns student number generation, records, and allocation checks. Do not restore browser-only writes.
- Keep the server bound to localhost until deployment security, backups, and school-specific privacy requirements are defined.
- Keep student identity separate from term enrollments. A student keeps one student ID across terms and section changes. Academic terms are stored in the database; the active term controls section and allocation views.
- Format student numbers as `YY-00001`: the two-digit calendar year when the record is created, followed by a five-digit sequence that resets each year. Existing numbers never change at a year boundary.
- Model students, subjects, academic terms, sections, and enrollments as separate entities with foreign keys and appropriate unique constraints. Current sections have one meeting time each; expand this only when multiple meetings are required.
- Enforce enrollment rules on the server: section capacity, duplicate enrollment, and student schedule conflicts. UI checks may improve feedback but cannot replace server validation.
- Open the local application directly without account creation or sign-in. Keep it bound to localhost; revisit access controls if it is deployed to a shared server.

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
