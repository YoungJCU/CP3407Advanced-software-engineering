const db = require('../database/db');
const path = require('path');
const fs = require('fs');

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function loadCampusJson() {
  const campusPath = path.join(__dirname, '../../client/data/campus_mapped_improved.json');
  try {
    return JSON.parse(fs.readFileSync(campusPath, 'utf8'));
  } catch (e) {
    return { levels: [] };
  }
}

exports.search = (req, res) => {
  const raw = String(req.query.q || '').trim();
  if (raw.length < 1) {
    return res.json({ success: true, data: [] });
  }

  const q = norm(raw);
  const safeLike = `%${q.replace(/%/g, '')}%`;
  const campus = loadCampusJson();
  const idSet = new Set();
  const roomMeta = {};

  for (const level of campus.levels || []) {
    const levelBlob = norm(`${level.name} ${level.id || ''} ${level.description || ''} ${level.building || ''}`);
    if (levelBlob.includes(q)) {
      (level.rooms || []).forEach((r) => {
        if (r.id != null) {
          idSet.add(r.id);
          roomMeta[r.id] = { levelId: level.id, levelName: level.name };
        }
      });
    }
    for (const room of level.rooms || []) {
      if (room.id == null) continue;
      if (norm(room.name).includes(q)) {
        idSet.add(room.id);
        roomMeta[room.id] = { levelId: level.id, levelName: level.name };
      }
    }
  }

  const sql = `
    SELECT DISTINCT c.id
    FROM classrooms c
    LEFT JOIN courses co ON co.classroomId = c.id
    WHERE lower(c.name) LIKE ?
       OR lower(c.building) LIKE ?
       OR lower(COALESCE(cast(c.floor as text), '')) LIKE ?
       OR lower(COALESCE(co.courseName, '')) LIKE ?
       OR lower(COALESCE(co.courseCode, '')) LIKE ?
       OR lower(COALESCE(co.dayOfWeek, '')) LIKE ?
       OR lower(COALESCE(co.sessionType, '')) LIKE ?
       OR lower(COALESCE(co.trimester, '')) LIKE ?
       OR lower(trim(COALESCE(co.startTime, '') || ' ' || COALESCE(co.endTime, ''))) LIKE ?
  `;
  const params = [safeLike, safeLike, safeLike, safeLike, safeLike, safeLike, safeLike, safeLike, safeLike];

  db.all(sql, params, (err, rows) => {
    if (err) {
      return res.status(500).json({ success: false, message: err.message });
    }
    (rows || []).forEach((r) => idSet.add(r.id));

    const ids = Array.from(idSet);
    if (ids.length === 0) {
      return res.json({ success: true, data: [] });
    }

    const ph = ids.map(() => '?').join(',');
    db.all(`SELECT * FROM classrooms WHERE id IN (${ph}) ORDER BY floor, name`, ids, (err2, rooms) => {
      if (err2) {
        return res.status(500).json({ success: false, message: err2.message });
      }
      db.all(
        `SELECT * FROM courses WHERE classroomId IN (${ph}) ORDER BY dayOfWeek, startTime`,
        ids,
        (err3, allCourses) => {
          if (err3) {
            return res.status(500).json({ success: false, message: err3.message });
          }
          const byRoom = {};
          (rooms || []).forEach((r) => {
            byRoom[r.id] = {
              classroom: r,
              courses: [],
              levelId: roomMeta[r.id] ? roomMeta[r.id].levelId : null,
              levelName: roomMeta[r.id] ? roomMeta[r.id].levelName : null,
            };
          });
          (allCourses || []).forEach((c) => {
            if (byRoom[c.classroomId]) {
              byRoom[c.classroomId].courses.push(c);
            }
          });
          const data = Object.values(byRoom).filter((x) => x.classroom);
          return res.json({ success: true, data });
        }
      );
    });
  });
};
