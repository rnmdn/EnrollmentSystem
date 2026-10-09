# Registrar Workspace

A local enrollment application for student records, section scheduling, allocation, and student timetables. It uses jQuery UI for date selection, student autocomplete, and confirmation dialogs. Records are stored in SQLite. Students register without an account; the registrar signs in.

## Run locally

```powershell
npm install
npm run dev
```

Use Node 24. Open the local URL printed by Vite. Run `npm test` for database and API checks. Run `npm run build` then `npm start` to serve the built app locally.

Students open `/student.html` to register or check their assigned schedule. The registrar opens `/`, creates a password on first use, and signs in to review new registrations and manage enrollment. The password is stored as a salted hash in the local SQLite database.

## Data and scope

Records are saved in `data/registrar.sqlite`, which is excluded from Git. Back up this file before moving or replacing the app. If browser prototype records exist and the database is empty, they are imported when the app opens. The browser copy is removed only after a successful import.

## Registration and enrollment flow

Students enter their identity, birth date, gender, address, contact details, program, and year level. The server checks for an existing email and birth date before creating a master record and permanent ID. A registrar reviews pending registrations before enrollment. The registrar can create sections and specify existing subject codes as prerequisites. Completed subjects are recorded on the student profile. The registrar adds available sections to an enrollment list, reviews the complete list, and confirms it. The server checks prerequisites, capacity, duplicate allocation, and schedule conflicts in one transaction. Students can check their ID and confirmed schedule from the student page; the registrar has a timetable and schedule list.

The local student workflow needs no account. Registrar review uses a password-backed session. This is still a localhost application: student status lookup uses ID, email, and birth date, which is insufficient identity verification for a public service. Do not expose this build as a public student records service.

Student numbers use `YY-00001` format based on the Singapore calendar year when the student is registered. The sequence restarts each year. Existing numbers do not change at a year boundary.

The current app is local-only. Academic terms can be created and activated from the sidebar; each term has its own sections and allocations, while student master records and IDs persist across terms. The dashboard analytics chart compares filled and available seats by section for the active term. Sections currently have one meeting day. A school deployment still needs configured backups, a chosen hosting environment, and review of privacy and access requirements.
