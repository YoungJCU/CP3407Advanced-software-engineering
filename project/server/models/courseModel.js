const db = require('../database/db');

exports.getCoursesByClassroom = (classroomId) => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM courses WHERE classroomId = ?', [classroomId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

