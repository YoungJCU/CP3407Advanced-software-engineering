# Database Quickstart

This guide matches the current project structure and can be used directly.

## 1. Relevant files

- `project/server/database/campus.db`
  - SQLite database file.
  - This is a binary file, so opening it in a plain text editor may look blank or unreadable.

- `project/server/database/init.sql`
  - Database reset and initialization SQL script.
  - Open this in any code editor to read or edit the SQL.

- `project/server/database/demo_courses_tr1.json`
  - Demo course seed data used by the backend.

- `project/client/data/campus_mapped_improved.json`
  - Room, level, and campus structure data used for map and search metadata.

- `project/client/data/room_local_timetable.json`
  - Local timetable-style data for fallback/demo usage.

- `project/client/data/course_search_index.json`
  - Local search index used by the frontend.

- `project/client/data/block_map.json`
  - Map layout data for blocks, gate, roads, and routing waypoints.

## 2. How to open each type of file

### SQL file

Open directly in your editor:

```bash
open "/Users/chongyuang/CP3407PRAC/web（svg） 2/project/server/database/init.sql"
```

Or in VS Code / Cursor:

```bash
code "/Users/chongyuang/CP3407PRAC/web（svg） 2/project/server/database/init.sql"
```

### JSON datasets

Open directly in your editor, for example:

```bash
code "/Users/chongyuang/CP3407PRAC/web（svg） 2/project/client/data/campus_mapped_improved.json"
code "/Users/chongyuang/CP3407PRAC/web（svg） 2/project/client/data/block_map.json"
```

### SQLite database file

Do not open `campus.db` as plain text.

Use either:

1. Terminal with `sqlite3`
2. A GUI tool such as DB Browser for SQLite
3. A database extension inside VS Code / Cursor

## 3. Quick database view commands

Run these from the project root:

```bash
cd "/Users/chongyuang/CP3407PRAC/web（svg） 2/project"
```

See all tables:

```bash
sqlite3 server/database/campus.db ".tables"
```

See a table structure:

```bash
sqlite3 server/database/campus.db ".schema classrooms"
sqlite3 server/database/campus.db ".schema courses"
sqlite3 server/database/campus.db ".schema users"
```

See some actual data:

```bash
sqlite3 server/database/campus.db "SELECT * FROM users;"
sqlite3 server/database/campus.db "SELECT id, name, building, floor FROM classrooms LIMIT 10;"
sqlite3 server/database/campus.db "SELECT classroomId, courseCode, courseName, dayOfWeek, startTime, endTime FROM courses LIMIT 10;"
```

Count records:

```bash
sqlite3 server/database/campus.db "SELECT COUNT(*) FROM classrooms;"
sqlite3 server/database/campus.db "SELECT COUNT(*) FROM courses;"
sqlite3 server/database/campus.db "SELECT COUNT(*) FROM users;"
```

## 4. How to rebuild the database

From the project root:

```bash
cd "/Users/chongyuang/CP3407PRAC/web（svg） 2/project"
sqlite3 server/database/campus.db < server/database/init.sql
```

What this does:

- Drops the old tables
- Recreates the schema
- Inserts minimal demo users/classroom/course data

Important:

- After the Express server starts, `server/database/db.js` may automatically expand this into the fuller classroom/course demo dataset if it detects the DB is incomplete.

## 5. How to start the app after rebuilding

```bash
cd "/Users/chongyuang/CP3407PRAC/web（svg） 2/project/server"
npm install
npm start
```

Then open:

```text
http://localhost:3001/
```

## 6. How to verify the rebuild worked

In another terminal:

```bash
cd "/Users/chongyuang/CP3407PRAC/web（svg） 2/project"
sqlite3 server/database/campus.db ".tables"
sqlite3 server/database/campus.db "SELECT COUNT(*) FROM users;"
sqlite3 server/database/campus.db "SELECT COUNT(*) FROM classrooms;"
```

Run tests:

```bash
cd "/Users/chongyuang/CP3407PRAC/web（svg） 2/project/server"
npm test
```

## 7. Why the database sometimes looks empty

Common reasons:

- You opened `campus.db` in a text editor instead of a SQLite viewer.
- You opened `index.html` with `file://` instead of running the server.
- You rebuilt the DB but did not restart the backend.
- The frontend is reading JSON fallback data rather than live backend data.
