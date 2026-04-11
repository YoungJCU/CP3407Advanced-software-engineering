#!/usr/bin/env node
// Improved name-to-id mapper using Levenshtein similarity (no external deps)
// Usage: node map_names_to_ids_improved.js [backendBaseUrl] [inPath] [outPath]

const http = require('http');
const fs = require('fs');
const path = require('path');

const backend = process.argv[2] || 'http://localhost:3000';
const inPath = process.argv[3] ? path.resolve(process.argv[3]) : path.join(__dirname, '..', 'data', 'campus.json');
const outPath = process.argv[4] ? path.resolve(process.argv[4]) : path.join(__dirname, '..', 'data', 'campus_mapped_improved.json');

function normalizeName(s){
  return (s||'').toLowerCase().replace(/[\s\-_:,\(\)\/\\]+/g,' ').replace(/[^a-z0-9 ]/g,'').trim();
}

function levenshtein(a, b){
  if(a===b) return 0;
  const al = a.length, bl = b.length;
  if(al===0) return bl;
  if(bl===0) return al;
  const v0 = new Array(bl+1).fill(0).map((_,i)=>i);
  const v1 = new Array(bl+1).fill(0);
  for(let i=0;i<al;i++){
    v1[0] = i+1;
    for(let j=0;j<bl;j++){
      const cost = a[i]===b[j] ? 0 : 1;
      v1[j+1] = Math.min(v1[j]+1, v0[j+1]+1, v0[j]+cost);
    }
    for(let k=0;k<=bl;k++) v0[k]=v1[k];
  }
  return v1[bl];
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

  let matched = 0, total = 0;
  const unmatched = [];

  for(const lvl of campus.levels || []){
    for(const room of lvl.rooms || []){
      total++;
      const n = normalizeName(room.name);
      let best = null; let bestScore = 0;
      for(const c of backendList){
        const cn = normalizeName(c.name);
        const dist = levenshtein(n, cn);
        const maxLen = Math.max(n.length, cn.length) || 1;
        const sim = 1 - (dist / maxLen);
        if(sim > bestScore){ bestScore = sim; best = c; }
      }
      // threshold: require at least 0.55 similarity (tunable)
      if(best && bestScore >= 0.55){
        room.id = best.id;
        matched++;
      } else {
        room.id = null;
        unmatched.push({ level: lvl.name, room: room.name, bestMatch: best ? best.name : null, score: Math.round(bestScore*100)/100 });
      }
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(campus, null, 2), 'utf8');
  console.log(`Wrote mapped data to ${outPath}`);
  console.log(`Matched ${matched}/${total} rooms (${Math.round((matched/total)*100)}%)`);
  if(unmatched.length){
    console.log('Unmatched rooms (with best candidate and score):');
    unmatched.forEach(u=> console.log('-', u.level, '->', u.room, ' | best:', u.bestMatch, 'score:', u.score));
  }
})();

