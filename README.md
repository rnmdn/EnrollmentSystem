# Registrar Workspace

A local enrollment application for student records, section scheduling, allocation, and student timetables. It uses jQuery UI for date selection, student autocomplete, and confirmation dialogs. Records are stored in SQLite, and the app opens directly without an account.

## Run locally

```powershell
npm install
npm run dev
```

Use Node 24. Open the local URL printed by Vite. Run `npm test` for database and API checks. Run `npm run build` then `npm start` to serve the built app locally.

## Data and scope

Records are saved in `data/registrar.sqlite`, which is excluded from Git. Back up this file before moving or replacing the app. If browser prototype records exist and the database is empty, they are imported when the app opens. The browser copy is removed only after a successful import.

## Registration and enrollment flow

Enter the student's identity, birth date, gender, address, contact details, program, and year level. The server checks for an existing email or matching name and birth date before creating a master record and permanent ID. Existing records can be selected from the student list. A registrar can create a section and optionally specify existing subject codes as prerequisites. Completed subjects are recorded on the student profile. Enrollment shows the student's current sections, then asks for a final review of the subject, meeting time, room, instructor, seats, and prerequisites. The server checks prerequisites, capacity, duplicate allocation, and schedule conflicts when the registrar confirms. The confirmed schedule opens as a timetable and list.

The local workflow has no account creation or sign-in. The registrar review is a confirmation step in the interface, not an authenticated approval. Do not expose this build as a public student records service.

Student numbers use `YY-00001` format based on the Singapore calendar year when the student is registered. The sequence restarts each year. Existing numbers do not change at a year boundary.

The current app is local-only. Academic terms can be created and activated from the sidebar; each term has its own sections and allocations, while student master records and IDs persist across terms. The dashboard analytics chart compares filled and available seats by section for the active term. Sections currently have one meeting day. A school deployment still needs configured backups, a chosen hosting environment, and review of privacy and access requirements.
