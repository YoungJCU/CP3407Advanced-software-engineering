# Database schema (campus.db)
Below are the tables, fields and descriptions derived from the current SQLite DB.

## classrooms
- id INTEGER PRIMARY KEY AUTOINCREMENT
- name TEXT — room name/label
- building TEXT
- floor INTEGER
- totalSeats INTEGER
- availableSeats INTEGER

## courses
- id INTEGER PRIMARY KEY AUTOINCREMENT
- classroomId INTEGER — FK to classrooms(id)
- courseName TEXT
- startTime TEXT
- endTime TEXT
- dayOfWeek TEXT
- courseCode TEXT
- trimester TEXT
- sessionType TEXT

## hotspots
- id INTEGER PRIMARY KEY AUTOINCREMENT
- name TEXT NOT NULL
- left_pct REAL NOT NULL
- top_pct REAL NOT NULL

## mappings
- id INTEGER PRIMARY KEY AUTOINCREMENT
- name_key TEXT NOT NULL UNIQUE
- classroom_id INTEGER NOT NULL

## users
- id INTEGER PRIMARY KEY AUTOINCREMENT
- email TEXT NOT NULL UNIQUE
- displayName TEXT NOT NULL
- role TEXT NOT NULL DEFAULT 'student'
- password TEXT NOT NULL (NOTE: stored plaintext for demo — not secure)