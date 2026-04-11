#!/usr/bin/env node
// Usage: node scrape_jcu.js <url> [outputPath]
// Example: node scrape_jcu.js "https://www.jcu.edu.sg/current-students/campus-maps-And-information/virtual-campus-tour" ../data/campus_from_jcu.json

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

async function fetchHtml(url){
  const res = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Node.js script)' } });
  return res.data;
}

function textClean(s){
  return (s||'').replace(/\s+/g, ' ').trim();
}

function extractStructure(html){
  const $ = cheerio.load(html);
  const levels = [];

  // Strategy:
  // 1) Find headings (h1-h4) that look like "Level", "Floor" or contain floor numbers.
  // 2) For each heading, collect following sibling elements until the next heading of similar level.
  // 3) Within that block, try to detect buildings (bold/strong/h5/a) and room lists (li or separated links).

  const headings = $('h1,h2,h3,h4');
  if(headings.length === 0){
    // fallback: collect sections by top-level article / section
    $('section,article,div').each((i, el) => {});
  }

  headings.each((i, el) => {
    const h = $(el);
    const ht = textClean(h.text());
    // Heuristic: if heading includes Level/Floor/Level \d or 第 N 层
    if(/(level|floor|楼层|第\s*\d+层|level\s*\d+)/i.test(ht)){
      const level = { id: `level-${i}`, name: ht, buildings: [] };
      // collect siblings
      let sib = h.next();
      let blockHtml = '';
      while(sib && sib.length && !(/^h1|h2|h3|h4$/i.test(sib[0].tagName))){
        blockHtml += $.html(sib);
        sib = sib.next();
      }
      const $$ = cheerio.load(blockHtml);
      // detect building headers inside block
      const bTitles = $$('h5,h6,strong,b');
      if(bTitles.length){
        bTitles.each((bi, bel) => {
          const name = textClean($$(bel).text());
          const b = { id: `b-${i}-${bi}`, name, rooms: [] };
          // grab nearby lists
          let next = $$(bel).next();
          if(next && next.length && next[0].tagName === 'ul'){
            next.find('li').each((li, ell) => {
              b.rooms.push({ id:null, name: textClean($$(ell).text()) });
            });
          }
          level.buildings.push(b);
        });
      } else {
        // fallback: look for lists of links or list items as buildings/rooms
        const lists = $$('ul,ol');
        if(lists.length){
          // assume first level's lists are buildings with li items as rooms
          lists.each((liidx, listEl) => {
            const rooms = [];
            $$(listEl).find('li').each((li, lle) => {
              rooms.push({ id:null, name: textClean($$(lle).text()) });
            });
            if(rooms.length){
              level.buildings.push({ id: `b-${i}-${liidx}`, name: `Building ${liidx+1}`, rooms });
            }
          });
        }
      }

      levels.push(level);
    }
  });

  // If we found nothing, try to parse anchor lists or sections
  if(levels.length === 0){
    // collect big sections by looking for elements with class names containing "level" or "floor"
    const possible = $('[class*=level],[class*=floor],[id*=level],[id*=floor]');
    possible.each((idx, el) => {
      const p = $(el);
      const name = textClean(p.text().split('\n')[0] || `Level ${idx+1}`);
      const lvl = { id: `level-${idx}`, name, buildings: [] };
      // find links inside
      p.find('a').each((ai, ael) => {
        const txt = textClean($(ael).text());
        // treat as a room if it contains 'room' or digits
        if(/room|rm|\d+/i.test(txt)){
          if(lvl.buildings.length === 0) lvl.buildings.push({ id: 'b-0', name: 'Buildings', rooms: [] });
          lvl.buildings[0].rooms.push({ id:null, name: txt });
        }
      });
      if(lvl.buildings.length) levels.push(lvl);
    });
  }

  return { levels };
}

async function main(){
  const url = process.argv[2] || 'https://www.jcu.edu.sg/current-students/campus-maps-And-information/virtual-campus-tour';
  const outPath = process.argv[3] || path.join(__dirname, '..', 'data', 'campus_from_jcu.json');

  console.log('Fetching', url);
  try{
    const html = await fetchHtml(url);
    const structured = extractStructure(html);
    // write to outPath
    fs.writeFileSync(outPath, JSON.stringify(structured, null, 2), 'utf8');
    console.log('Wrote extracted data to', outPath);
  }catch(err){
    console.error('Error fetching/parsing:', err.message || err);
    process.exit(1);
  }
}

if(require.main === module) main();

