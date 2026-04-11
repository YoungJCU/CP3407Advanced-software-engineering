#!/usr/bin/env node
// Import rooms from client/data/campus.json into server/database/campus.db
// Usage: node tools/import_campus.js

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const projectRoot = path.resolve(__dirname, '..', '..');
const dbDir = path.join(projectRoot, 'server', 'database');
const dbPath = path.join(dbDir, 'campus.db');
const backupPath = path.join(dbDir, `campus.db.bak.${Date.now()}`);
const campusJsonPath = path.join(projectRoot, 'client', 'data', 'campus.json');
const outMappedPath = path.join(projectRoot, 'client', 'data', 'campus_mapped.json');

if(!fs.existsSync(campusJsonPath)){
  console.error('campus.json not found at', campusJsonPath);
  process.exit(1);
}

if(!fs.existsSync(dbPath)){
  console.error('Database not found at', dbPath);
  process.exit(1);
}

console.log('Backing up DB to', backupPath);
fs.copyFileSync(dbPath, backupPath);

const campus = JSON.parse(fs.readFileSync(campusJsonPath, 'utf8'));
const db = new sqlite3.Database(dbPath);

function runQuery(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if(err) reject(err); else resolve(this);
    });
  });
}

function getRow(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if(err) reject(err); else resolve(row);
    });
  });
}

(async function main(){
  try{
    // Ensure tables exist
    await runQuery(`CREATE TABLE IF NOT EXISTS classrooms (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      building TEXT,
      floor INTEGER,
      totalSeats INTEGER,
      availableSeats INTEGER
    )`);

    await runQuery(`CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      classroomId INTEGER,
      courseName TEXT,
      startTime TEXT,
      endTime TEXT,
      dayOfWeek TEXT
    )`);

    const mapped = { levels: [] };
    let insertCount = 0;
    for(let li=0; li<(campus.levels||[]).length; li++){
      const lvl = campus.levels[li];
      const outLevel = Object.assign({}, lvl);
      outLevel.rooms = [];
      // determine floor number heuristically from level id or name
      let floorNum = null;
      const m = (lvl.id || lvl.name || '').match(/\d+/);
      if(m) floorNum = parseInt(m[0], 10);
      else floorNum = li + 1;

      for(const room of (lvl.rooms||[])){
        // Check if classroom already exists (by exact name and building)
        const existing = await getRow('SELECT * FROM classrooms WHERE name = ? AND building = ?', [room.name, lvl.building || null]);
        if(existing){
          room.id = existing.id;
        } else {
          const totalSeats = room.totalSeats || 30;
          const availableSeats = (typeof room.availableSeats === 'number') ? room.availableSeats : Math.max(0, Math.floor(totalSeats * 0.8));
          const res = await runQuery('INSERT INTO classrooms (name, building, floor, totalSeats, availableSeats) VALUES (?,?,?,?,?)', [room.name, lvl.building || null, floorNum, totalSeats, availableSeats]);
          // sqlite3 run returns `this` with lastID when used in callback; our runQuery resolves to that
          const lastId = res.lastID;
          room.id = lastId;
          insertCount++;
        }
        outLevel.rooms.push({ id: room.id, name: room.name });
      }
      mapped.levels.push(outLevel);
    }

    fs.writeFileSync(outMappedPath, JSON.stringify(mapped, null, 2), 'utf8');
    console.log(`Import complete. Inserted ${insertCount} new classrooms. Wrote mapped file to ${outMappedPath}`);
    db.close();
  }catch(err){
    console.error('Error during import:', err);
    db.close();
    process.exit(1);
  }
})();
