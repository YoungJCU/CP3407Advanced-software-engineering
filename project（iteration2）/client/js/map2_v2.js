// map2_v2.js - enhanced map UI (fixed warnings)
(function(){
  document.addEventListener('DOMContentLoaded', () => {
    const svg = document.getElementById('campusMap');
    const details = document.getElementById('details');
    const loadStatusEl = document.getElementById('loadStatus');
    const levelSelect = document.getElementById('levelSelect');
    const buildingSelect = document.getElementById('buildingSelect');
    const roomList = document.getElementById('roomList');

    function updateLoadStatus(msg){ if(loadStatusEl) loadStatusEl.textContent = msg; }

    async function loadCampus(){
      try{
        const res = await fetch('data/campus_mapped.json');
        if(res.ok) return await res.json();
      }catch(e){ console.warn('load campus_mapped failed', e); }
      try{ const r = await fetch('data/campus.json'); if(r.ok) return await r.json(); }catch(e){ console.warn('load campus.json failed', e); }
      return null;
    }

    function normalizeName(s){ return (s||'').toLowerCase().replace(/[\s\-_:,()\/\\]+/g,' ').replace(/[^a-z0-9 ]/g,'').trim(); }
    function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function getBuildings(campusData){
      if(!campusData || !Array.isArray(campusData.levels)) return [];
      const map = new Map();
      campusData.levels.forEach(l => {
        const b = l.building || '默认建筑';
        if(!map.has(b)) map.set(b, []);
        map.get(b).push(l);
      });
      const arr = [];
      for(const [name, levels] of map.entries()) arr.push({ name, levels });
      return arr;
    }

    function renderBuildingsOverview(campusData){
      if(!svg) return;
      while(svg.firstChild) svg.removeChild(svg.firstChild);
      const buildings = getBuildings(campusData);
      const ns='http://www.w3.org/2000/svg';
      const cols = 2; const cardW=320; const cardH=120; const gap=20; const startX=20; const startY=20;
      svg.setAttribute('viewBox', `0 0 760 520`);
      buildings.forEach((b, idx) => {
        const row = Math.floor(idx/cols); const col = idx%cols;
        const x = startX + col*(cardW+gap); const y = startY + row*(cardH+gap);
        const rect = document.createElementNS(ns,'rect'); rect.setAttribute('x',x); rect.setAttribute('y',y); rect.setAttribute('width',cardW); rect.setAttribute('height',cardH); rect.setAttribute('rx',12); rect.setAttribute('fill','#fff'); rect.setAttribute('stroke','#cbd5e1'); rect.classList.add('building-card');
        const title = document.createElementNS(ns,'text'); title.setAttribute('x', x+16); title.setAttribute('y', y+32); title.setAttribute('font-size', '18'); title.textContent = b.name;
        const info = document.createElementNS(ns,'text'); info.setAttribute('x', x+16); info.setAttribute('y', y+58); info.setAttribute('font-size','13'); info.setAttribute('fill','#6b7280'); info.textContent = `${b.levels.length} 层 · ${b.levels.reduce((acc,l)=> acc + (l.rooms?l.rooms.length:0),0)} 个房间`;
        svg.appendChild(rect); svg.appendChild(title); svg.appendChild(info);
        const onClick = () => { renderLevelsForBuilding(b, campusData); };
        rect.style.cursor='pointer'; title.style.cursor='pointer'; info.style.cursor='pointer';
        rect.addEventListener('click', onClick); title.addEventListener('click', onClick); info.addEventListener('click', onClick);
      });
    }

    function renderLevelsForBuilding(building, campusData){
      if(!buildingSelect || !levelSelect) return;
      buildingSelect.innerHTML = `<option>${escapeHtml(building.name)}</option>`;
      levelSelect.innerHTML = (building.levels||[]).map(l => `<option value='${l.id}'>${escapeHtml(l.name)}</option>`).join('');
      if(building.levels && building.levels.length) renderRoomList(building.levels[0]);
    }

    function renderRoomList(level){
      if(!roomList) return;
      roomList.innerHTML = '';
      if(!level || !level.rooms) { roomList.innerHTML = '<div style="color:var(--muted)">无房间</div>'; return; }
      level.rooms.forEach(r => {
        const div = document.createElement('div'); div.className='room-item'; div.textContent = r.name; div.dataset.id = r.id || '';
        div.style.cursor='pointer';
        div.addEventListener('click', () => showLocalDetails(r, level));
        roomList.appendChild(div);
      });
      renderSvgForLevel(level);
    }

    function renderSvgForLevel(level){
      if(!svg) return;
      while(svg.firstChild) svg.removeChild(svg.firstChild);
      const ns='http://www.w3.org/2000/svg';
      const rooms = level.rooms || [];
      const cols = 3; const boxW=180; const boxH=90; const gapX=20; const gapY=18; const startX=20; const startY=20;
      svg.setAttribute('viewBox', `0 0 760 520`);
      rooms.forEach((r, idx) => {
        const row = Math.floor(idx/cols); const col = idx%cols;
        const x = startX + col*(boxW+gapX); const y = startY + row*(boxH+gapY);
        const rect = document.createElementNS(ns,'rect'); rect.setAttribute('x',x); rect.setAttribute('y',y); rect.setAttribute('width',boxW); rect.setAttribute('height',boxH); rect.setAttribute('rx',10); rect.setAttribute('fill','#fff'); rect.setAttribute('stroke','#cbd5e1'); rect.setAttribute('data-key', normalizeName(r.name)); if(r.id) rect.setAttribute('data-id', r.id);
        const text = document.createElementNS(ns,'text'); text.setAttribute('x', x+12); text.setAttribute('y', y+28); text.textContent = r.name; text.setAttribute('data-key', normalizeName(r.name));
        svg.appendChild(rect); svg.appendChild(text);
        rect.style.cursor='pointer'; rect.addEventListener('click', async () => {
          if(r.id){
            try{ if(window.getClassroomById){ const resp = await window.getClassroomById(r.id); if(resp) showBackendDetails(resp); else showLocalDetails(r, level);} else showLocalDetails(r, level); } catch(e){ showLocalDetails(r, level); }
          } else showLocalDetails(r, level);
        });
      });
    }

    function showLocalDetails(room, level){
      details.innerHTML = `<div style="font-weight:700">${escapeHtml(room.name)}</div>` +
        `<div style="color:var(--muted);margin-top:6px">${escapeHtml(level.name)} — ${escapeHtml(level.building||'')}</div>` +
        `<div style="color:var(--muted);margin-top:6px">${escapeHtml(level.description||'')}</div>`;
    }

    function showBackendDetails(data){
      details.innerHTML = `<div style="font-weight:700">${escapeHtml(data.name||'教室')}</div>` +
        `<div style="color:var(--muted);margin-top:6px">${escapeHtml(data.building||'')}</div>` +
        `<div style="color:var(--muted);margin-top:6px">状态: ${escapeHtml(String(data.status||'未知'))}</div>` +
        `<div style="margin-top:6px;color:var(--muted)">${escapeHtml(data.description||'')}</div>`;
    }

    (async function main(){
      updateLoadStatus('加载地图数据...');
      const data = await loadCampus();
      if(!data){ updateLoadStatus('找不到 campus 数据'); return; }
      updateLoadStatus('已加载 campus 数据');
      renderBuildingsOverview(data);
      levelSelect.addEventListener('change', () => {
        const lid = levelSelect.value;
        const lvl = (data.levels||[]).find(l => l.id === lid);
        if(lvl) renderRoomList(lvl);
      });
    })();

  });
})();
