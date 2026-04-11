const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'campus.db');

try {
  fs.closeSync(fs.openSync(dbPath, 'a'));
} catch (e) { /* ignore */ }

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not open database', err);
  } else {
    console.log('Connected to SQLite database at', dbPath);
  }
});

function readJsonSync(relFromDatabaseDir) {
  const p = path.join(__dirname, relFromDatabaseDir);
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function runFullSeed(callback) {
  let campus;
  let demo;
  try {
    campus = readJsonSync('../../client/data/campus_mapped_improved.json');
    demo = readJsonSync('demo_courses_tr1.json');
  } catch (e) {
    console.error('Full seed failed: could not read JSON files', e.message);
    if (callback) callback(e);
    return;
  }
  const trimester = typeof demo.trimester === 'string' ? demo.trimester : 'Trimester 1, 2026';

  db.serialize(() => {
    db.run('DELETE FROM courses');
    db.run('DELETE FROM mappings');
    db.run('DELETE FROM classrooms');

    const insC = db.prepare(
      'INSERT INTO classrooms (id, name, building, floor, totalSeats, availableSeats) VALUES (?,?,?,?,?,?)'
    );
    for (const level of campus.levels || []) {
      const floorMatch = String(level.id).match(/(\d+)/);
      const floor = floorMatch ? parseInt(floorMatch[1], 10) : 1;
      for (const room of level.rooms || []) {
        const cap = 40 + (Number(room.id) % 7) * 12;
        const avail = Math.max(0, cap - 10 - (Number(room.id) % 5) * 3);
        insC.run(room.id, room.name, 'JCU Singapore — Main Campus', floor, cap, avail);
      }
    }
    insC.finalize();

    const insCo = db.prepare(
      `INSERT INTO courses (classroomId, courseName, startTime, endTime, dayOfWeek, courseCode, trimester, sessionType)
       VALUES (?,?,?,?,?,?,?,?)`
    );
    for (const c of demo.courses || []) {
      insCo.run(
        c.classroomId,
        c.courseName,
        c.startTime,
        c.endTime,
        c.dayOfWeek,
        c.courseCode || null,
        trimester,
        c.sessionType || null
      );
    }
    insCo.finalize();
    console.log('Campus classrooms and courses loaded.');
    if (callback) callback(null);
  });
}

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS classrooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    building TEXT,
    floor INTEGER,
    totalSeats INTEGER,
    availableSeats INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS courses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    classroomId INTEGER,
    courseName TEXT,
    startTime TEXT,
    endTime TEXT,
    dayOfWeek TEXT,
    FOREIGN KEY(classroomId) REFERENCES classrooms(id)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS hotspots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    left_pct REAL NOT NULL,
    top_pct REAL NOT NULL
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS mappings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name_key TEXT NOT NULL UNIQUE,
    classroom_id INTEGER NOT NULL
  )`);

  db.run('ALTER TABLE courses ADD COLUMN courseCode TEXT', (err) => {
    if (err && !String(err.message).includes('duplicate column')) {
      console.warn('ALTER courses.courseCode', err.message);
    }
  });
  db.run('ALTER TABLE courses ADD COLUMN trimester TEXT', (err) => {
    if (err && !String(err.message).includes('duplicate column')) {
      console.warn('ALTER courses.trimester', err.message);
    }
  });
  db.run('ALTER TABLE courses ADD COLUMN sessionType TEXT', (err) => {
    if (err && !String(err.message).includes('duplicate column')) {
      console.warn('ALTER courses.sessionType', err.message);
    }
  });

  db.get(
    `SELECT
       (SELECT COUNT(*) FROM classrooms) AS cRooms,
       (SELECT COUNT(*) FROM courses) AS cCourses,
       (SELECT COUNT(*) FROM classrooms WHERE id BETWEEN 43 AND 47 AND name LIKE 'Classroom L2-0%') AS hasL205to209`,
    (err, row) => {
      if (err) {
        console.error('Count check failed', err);
        return;
      }
      const cRooms = row && typeof row.cRooms === 'number' ? row.cRooms : 0;
      const cCourses = row && typeof row.cCourses === 'number' ? row.cCourses : 0;
      const hasL2new = row && row.hasL205to209 === 5;
      const needSeed = cRooms !== 44 || cCourses < 60 || !hasL2new;
      if (needSeed) {
        runFullSeed();
      }
    }
  );
});

module.exports = db;
