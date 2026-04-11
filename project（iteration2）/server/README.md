Server folder: run `npm install` and then `npm start` to start the API on port 3000.

Routes:
GET /api/classrooms -> list all
GET /api/classrooms/:id -> classroom details and courses
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, 'campus.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Could not open database', err);
  } else {
    console.log('Connected to SQLite database at', dbPath);
  }
});

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

  // Seed sample data if classrooms table is empty
  db.get('SELECT COUNT(*) AS cnt FROM classrooms', (err, row) => {
    if (err) {
      console.error('Count check failed', err);
      return;
    }
    if (row && row.cnt === 0) {
      const insertClass = db.prepare(`INSERT INTO classrooms (name, building, floor, totalSeats, availableSeats) VALUES (?,?,?,?,?)`);
      insertClass.run('Room 101', 'Main Building', 1, 50, 20);
      insertClass.run('Room 102', 'Main Building', 1, 40, 5);
      insertClass.run('Room 201', 'Science Block', 2, 60, 30);
      insertClass.finalize();

      const insertCourse = db.prepare(`INSERT INTO courses (classroomId, courseName, startTime, endTime, dayOfWeek) VALUES (?,?,?,?,?)`);
      insertCourse.run(1, 'Calculus I', '09:00', '10:30', 'Mon');
      insertCourse.run(1, 'Physics Lab', '11:00', '13:00', 'Wed');
      insertCourse.run(2, 'Programming 101', '14:00', '16:00', 'Tue');
      insertCourse.finalize();

      console.log('Seeded database with sample classrooms and courses');
    }
  });
});

module.exports = db;

