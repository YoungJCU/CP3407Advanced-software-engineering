# Project docs index

Files included here:

- `database_quickstart.md` — how to open datasets, inspect SQLite, rebuild the DB, and verify the app
- `db_schema.md` — schema and field descriptions
- `er_diagram.svg` — ER diagram for the SQLite schema
- `weekly_summary_checklist.md` — weekly summary checklist

Quick commands

- Reset the SQLite database from the project root:
```bash
cd "web（svg） 2/project"
sqlite3 server/database/campus.db < server/database/init.sql
```

- Start the server:
```bash
cd "web（svg） 2/project/server"
npm install
npm start
```

- Run automated tests:
```bash
cd "web（svg） 2/project/server"
npm test
```

How to inspect the database

- `server/database/init.sql` is a plain-text SQL script and should open in any code editor.
- `server/database/campus.db` is a binary SQLite database file, so opening it in a text editor may look blank or unreadable.
- Use one of these instead:
```bash
sqlite3 server/database/campus.db ".tables"
sqlite3 server/database/campus.db "SELECT COUNT(*) FROM classrooms;"
```

Submission reminders

1. Keep `db_schema.md`, `er_diagram.svg`, and `init.sql` in sync.
2. Include a final report file in the submission package.
3. Keep the test summary aligned with the current test suite.
