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

Student numbers use `YY-00001` format based on the Singapore calendar year when the student is registered. The sequence restarts each year. Existing numbers do not change at a year boundary.

The current app is local-only. Academic terms can be created and activated from the sidebar; each term has its own sections and allocations, while student master records and IDs persist across terms. The dashboard analytics chart compares filled and available seats by section for the active term. Sections currently have one meeting day. A school deployment still needs configured backups, a chosen hosting environment, and review of privacy and access requirements.
