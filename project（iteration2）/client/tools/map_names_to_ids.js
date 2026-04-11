#!/usr/bin/env node
// Map campus.json room names to backend classroom ids by fetching /api/classrooms
// Usage: node map_names_to_ids.js [backendBaseUrl] [inPath] [outPath]
// Example: node map_names_to_ids.js http://localhost:3000 ../data/campus.json ../data/campus_mapped.json

const http = require('http');
const fs = require('fs');
const path = require('path');

const backend = process.argv[2] || 'http://localhost:3000';
const inPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(__dirname, '..', 'data', 'campus.json');
const outPath = process.argv[4] ? path.resolve(process.argv[4]) : path.join(__dirname, '..', 'data', 'campus_mapped.json');

function normalizeName(s){
  return (s||'').toLowerCase().replace(/[\s\-_:,\(\)\/\\]+/g,' ').replace(/[^a-z0-9 ]/g,'').trim();
}

function fetchClassrooms(){
  const url = new URL('/api/classrooms', backend).toString();
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let data='';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try{
          const obj = JSON.parse(data);
          if(obj && obj.success && Array.isArray(obj.data)) resolve(obj.data);
          else reject(new Error('Unexpected API response'));
        }catch(e){ reject(e); }
      });
    });
    req.on('error', reject);
  });
}

(async function main(){
  console.log('Reading', inPath);
  if(!fs.existsSync(inPath)){
    console.error('Input campus.json not found at', inPath);
    process.exit(1);
  }
  const campus = JSON.parse(fs.readFileSync(inPath,'utf8'));
  let backendList = [];
  try{
    console.log('Fetching classrooms from', backend);
    backendList = await fetchClassrooms();
    console.log('Loaded', backendList.length, 'classrooms from backend');
  }catch(err){
    console.error('Failed to fetch backend classrooms:', err.message || err);
    process.exit(1);
  }

  const normalizeMap = new Map();
  backendList.forEach(c => normalizeMap.set(normalizeName(c.name), c));

  let matched = 0, total = 0;
  const unmatched = [];

  for(const lvl of campus.levels || []){
    for(const room of lvl.rooms || []){
      total++;
      const n = normalizeName(room.name);
      let found = null;
      if(normalizeMap.has(n)) found = normalizeMap.get(n);
      else {
        // contains or contained
        found = backendList.find(c => normalizeName(c.name).includes(n) || n.includes(normalizeName(c.name)));
      }
      if(!found){
        // fuzzy score by word overlap
        const nameWords = new Set(n.split(' ').filter(Boolean));
        let best=null, bestScore=0;
        for(const c of backendList){
          const cw = normalizeName(c.name).split(' ').filter(Boolean);
          let score=0; for(const w of cw) if(nameWords.has(w)) score++;
          if(score>bestScore){ bestScore=score; best=c; }
        }
        if(bestScore>0) found = best;
      }
      if(found){
        room.id = found.id;
        matched++;
      } else {
        room.id = null;
        unmatched.push({ level: lvl.name, room: room.name });
      }
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(campus, null, 2), 'utf8');
  console.log(`Wrote mapped data to ${outPath}`);
  console.log(`Matched ${matched}/${total} rooms (${Math.round((matched/total)*100)}%)`);
  if(unmatched.length){
    console.log('Unmatched rooms:');
    unmatched.forEach(u=> console.log('-', u.level, '->', u.room));
  }
})();

