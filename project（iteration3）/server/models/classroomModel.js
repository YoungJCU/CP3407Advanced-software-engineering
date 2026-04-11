const db = require('../database/db');

exports.getAllClassrooms = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM classrooms', [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
};

exports.getClassroomById = (id) => {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM classrooms WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
};

