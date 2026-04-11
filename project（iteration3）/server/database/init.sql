-- init.sql: reset schema and insert minimal demo seeds
-- Run from the project root:
--   sqlite3 server/database/campus.db < server/database/init.sql
--
-- Note:
-- - This script intentionally resets the database so repeated runs are deterministic.
-- - When the Express server starts, db.js may expand this minimal seed into the full
--   classroom/course demo dataset if it detects the DB is still incomplete.

PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS courses;
DROP TABLE IF EXISTS mappings;
DROP TABLE IF EXISTS hotspots;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS classrooms;

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS classrooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT,
  building TEXT,
  floor INTEGER,
  totalSeats INTEGER,
  availableSeats INTEGER
);

CREATE TABLE IF NOT EXISTS courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  classroomId INTEGER,
  courseName TEXT,
  startTime TEXT,
  endTime TEXT,
  dayOfWeek TEXT,
  courseCode TEXT,
  trimester TEXT,
  sessionType TEXT,
  FOREIGN KEY(classroomId) REFERENCES classrooms(id)
);

CREATE TABLE IF NOT EXISTS hotspots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  left_pct REAL NOT NULL,
  top_pct REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS mappings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name_key TEXT NOT NULL UNIQUE,
  classroom_id INTEGER NOT NULL,
  FOREIGN KEY(classroom_id) REFERENCES classrooms(id)
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  displayName TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'student',
  password TEXT NOT NULL
);

-- demo seeds
INSERT INTO users (email, displayName, role, password) VALUES ('student1@jcu.edu.sg','Student One','student','Password123');
INSERT INTO users (email, displayName, role, password) VALUES ('teacher1@jcu.edu.sg','Teacher One','lecturer','Password123');
INSERT INTO users (email, displayName, role, password) VALUES ('admin@jcu.edu.sg','Campus Admin','admin','Password123');

INSERT INTO classrooms (id,name,building,floor,totalSeats,availableSeats)
VALUES (1,'LT1','JCU Singapore - Main Campus',1,120,50);

INSERT INTO courses (classroomId, courseName, startTime, endTime, dayOfWeek, courseCode, trimester, sessionType)
VALUES (1,'CP3407 Advanced Software Engineering','10:00','12:00','Wed','CP3407','Trimester 1, 2026','Lecture');
