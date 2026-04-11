// map2_final_v2.js - final enhanced UI with mapping, backend merging, and live backend status
(function(){
  document.addEventListener('DOMContentLoaded', () => {
    const svg = document.getElementById('campusMap');
    const details = document.getElementById('details');
    const loadStatusEl = document.getElementById('loadStatus');
    const levelSelect = document.getElementById('levelSelect');
    const buildingSelect = document.getElementById('buildingSelect');
    const roomList = document.getElementById('roomList');
    const backendStatusEl = document.getElementById('backendStatus');

    let campusData = null;
    let backendClassrooms = [];
    let currentLevel = null;

    const MAPPING_KEY = 'campus_room_map_v1';
    function loadMappings(){ try{ return JSON.parse(localStorage.getItem(MAPPING_KEY) || '{}'); }catch(e){ return {}; } }
    function saveMappings(m){ localStorage.setItem(MAPPING_KEY, JSON.stringify(m)); }
    let mappings = loadMappings();

    function updateLoadStatus(msg){ if(loadStatusEl) loadStatusEl.textContent = msg; }
    function updateBackendStatus(up){
      if(!backendStatusEl) return;
      if(up){ backendStatusEl.textContent = '后端：在线'; backendStatusEl.style.background = '#d1fae5'; backendStatusEl.style.color = '#065f46'; }
      else { backendStatusEl.textContent = '后端：离线'; backendStatusEl.style.background = '#fee2e2'; backendStatusEl.style.color = '#991b1b'; }
    }

    async function loadCampus(){
      try{ const res = await fetch('data/campus_mapped.json'); if(res.ok) return await res.json(); }catch(e){ console.warn('load campus_mapped failed', e); }
      try{ const r = await fetch('data/campus.json'); if(r.ok) return await r.json(); }catch(e){ console.warn('load campus.json failed', e); }
      return null;
    }

    function normalizeName(s){ return (s||'').toLowerCase().replace(/[\s\-_:,()\/\\]+/g,' ').replace(/[^a-z0-9 ]/g,'').trim(); }
    function escapeHtml(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

    function getBuildings(data){
      if(!data || !Array.isArray(data.levels)) return [];
      const map = new Map();
      data.levels.forEach(l => {
        const b = l.building || '默认建筑';
        if(!map.has(b)) map.set(b, []);
        map.get(b).push(l);
      });
      const arr = [];
      for(const [name, levels] of map.entries()) arr.push({ name, levels });
      return arr;
    }

    function renderBuildingsOverview(data){
      if(!svg) return;
      while(svg.firstChild) svg.removeChild(svg.firstChild);
      const buildings = getBuildings(data);
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
        const onClick = () => { renderLevelsForBuilding(b); };
        rect.style.cursor='pointer'; title.style.cursor='pointer'; info.style.cursor='pointer';
        rect.addEventListener('click', onClick); title.addEventListener('click', onClick); info.addEventListener('click', onClick);
      });
    }

    function renderLevelsForBuilding(building){
      if(!buildingSelect || !levelSelect) return;
      buildingSelect.innerHTML = `<option>${escapeHtml(building.name)}</option>`;
      levelSelect.innerHTML = (building.levels||[]).map(l => `<option value='${l.id}'>${escapeHtml(l.name)}</option>`).join('');
      if(building.levels && building.levels.length) renderRoomList(building.levels[0]);
    }

    function renderRoomList(level){
      if(!roomList) return;
      currentLevel = level;
      roomList.innerHTML = '';
      if(!level || !level.rooms) { roomList.innerHTML = '<div style="color:var(--muted)">无房间</div>'; return; }
      level.rooms.forEach(r => {
        const div = document.createElement('div'); div.className='room-item'; div.textContent = r.name; div.dataset.id = r.id || '';
        div.style.cursor='pointer';
        div.addEventListener('click', () => showLocalOrBackendDetails(r, level));
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
        rect.style.cursor='pointer'; rect.addEventListener('click', () => showLocalOrBackendDetails(r, level));
      });
    }

    // mapping and merging
    function applyMappingForKey(nkey, backendId){
      for(const lvl of campusData.levels || []){
        for(const r of lvl.rooms || []){
          if(normalizeName(r.name) === nkey){ r.id = backendId; }
        }
      }
      mappings[nkey] = backendId; saveMappings(mappings);
      if(currentLevel) renderRoomList(currentLevel);
    }

    function mergeBackendClassrooms(){
      if(!campusData) return;
      const existingKeys = new Set();
      (campusData.levels||[]).forEach(l => (l.rooms||[]).forEach(r => existingKeys.add(normalizeName(r.name))));
      const unmatched = [];
      backendClassrooms.forEach(c => { if(!existingKeys.has(normalizeName(c.name))) unmatched.push(c); });
      if(unmatched.length === 0) return;
      let otherLevel = campusData.levels.find(l => l.id === 'backend-imported');
      for(const b of unmatched){
        let placed = false;
        if(typeof b.floor === 'number' || (b.floor && !isNaN(Number(b.floor)))){
          const bf = Number(b.floor);
          for(const lvl of campusData.levels){
            const m = (lvl.id || lvl.name || '').match(/\d+/);
            if(m && Number(m[0]) === bf){ lvl.rooms = lvl.rooms || []; lvl.rooms.push({ id: b.id, name: b.name }); placed = true; break; }
          }
        }
        if(!placed){ if(!otherLevel){ otherLevel = { id: 'backend-imported', name: '其他（后端）', building: '', description: '来自后端但未在 campus.json 中列出的教室', rooms: [] }; campusData.levels.push(otherLevel); }
          otherLevel.rooms.push({ id: b.id, name: b.name }); }
      }
      renderBuildingsOverview(campusData);
      if(currentLevel) renderRoomList(currentLevel);
    }

    function showLocalDetails(room, level){
      details.innerHTML = `<div style="font-weight:700">${escapeHtml(room.name)}</div>` +
        `<div style="color:var(--muted);margin-top:6px">${escapeHtml(level.name)} — ${escapeHtml(level.building||'')}</div>` +
        `<div style="color:var(--muted);margin-top:6px">${escapeHtml(level.description||'')}</div>`;
      // mapping UI when backend classrooms available
      if(Array.isArray(backendClassrooms) && backendClassrooms.length){
        const nkey = normalizeName(room.name);
        const sel = document.createElement('select'); sel.id='__mappingSelect__'; sel.style.marginTop='8px';
        const empty = document.createElement('option'); empty.value=''; empty.textContent='(选择后端教室)'; sel.appendChild(empty);
        backendClassrooms.forEach(c => { const o = document.createElement('option'); o.value = c.id; o.textContent = `${c.name} (${c.building||''})`; sel.appendChild(o); });
        if(mappings[nkey]) sel.value = mappings[nkey];
        const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.textContent='保存映射'; btn.style.marginLeft='8px';
        const container = document.createElement('div'); container.style.marginTop='10px'; container.appendChild(sel); container.appendChild(btn);
        // If backend available, add a second button to save mapping to backend
        let backendBtn = null;
        if(window.backendAvailable){
          backendBtn = document.createElement('button'); backendBtn.className='btn btn-ghost'; backendBtn.textContent='保存到后端'; backendBtn.style.marginLeft='8px'; container.appendChild(backendBtn);
        }
        details.appendChild(container);
        btn.addEventListener('click', () => { const val = sel.value; if(!val){ alert('请选择后端教室'); return; } applyMappingForKey(nkey, val); alert('已保存映射'); });
        if(backendBtn){
          backendBtn.addEventListener('click', async () => {
            const val = sel.value; if(!val){ alert('请选择后端教室'); return; }
            try{
              const res = await fetch('/api/mappings', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ name_key: nkey, classroom_id: Number(val) }) });
              const j = await res.json();
              if(j && j.success){
                // update local mappings and apply
                mappings[nkey] = Number(val); saveMappings(mappings); for(const lvl of campusData.levels || []){ for(const r of lvl.rooms || []){ if(normalizeName(r.name) === nkey){ r.id = Number(val); } } }
                if(currentLevel) renderRoomList(currentLevel);
                alert('已保存映射到后端');
              } else { alert('保存到后端失败'); }
            }catch(e){ console.warn('save mapping to backend failed', e); alert('保存失败（网络或服务器错误）'); }
          });
        }
      }
    }

    function showBackendDetails(data){
      details.innerHTML = `<div style="font-weight:700">${escapeHtml(data.name||'教室')}</div>` +
        `<div style="color:var(--muted);margin-top:6px">${escapeHtml(data.building||'')}</div>` +
        `<div style="color:var(--muted);margin-top:6px">状态: ${escapeHtml(String(data.status||'未知'))}</div>` +
        `<div style="margin-top:6px;color:var(--muted)">${escapeHtml(data.description||'')}</div>`;
    }

    async function showLocalOrBackendDetails(room, level){
      const nkey = normalizeName(room.name);
      if(mappings[nkey]){
        try{ const data = await window.getClassroomById(mappings[nkey]); showBackendDetails(data); return; }catch(e){ console.warn('mapped backend fetch failed', e); }
      }
      if(window.backendAvailable && room.id){
        try{ const data = await window.getClassroomById(room.id); showBackendDetails(data); return; }catch(e){ console.warn('backend fetch failed, showing local', e); }
      }
      showLocalDetails(room, level);
    }

    // react to backend up/down events
    window.addEventListener('backend:up', async () => {
      updateBackendStatus(true);
      updateLoadStatus('后端已启动，正在加载后端教室...');
      try{ backendClassrooms = await window.getClassrooms(); console.log('Loaded', backendClassrooms.length, 'classrooms from backend'); updateLoadStatus('已加载后端教室'); mergeBackendClassrooms(); }
      catch(e){ console.warn('failed loading backend classrooms', e); updateLoadStatus('加载后端教室失败'); }
    });
    window.addEventListener('backend:down', () => { updateBackendStatus(false); updateLoadStatus('后端已下线，使用本地数据'); backendClassrooms = []; });

    // initialize UI
    (async function main(){
      updateLoadStatus('加载地图数据...');
      campusData = await loadCampus();
      if(!campusData){ updateLoadStatus('找不到 campus 数据'); return; }
      updateLoadStatus('已加载 campus 数据');
      renderBuildingsOverview(campusData);
      levelSelect.addEventListener('change', () => {
        const lid = levelSelect.value;
        const lvl = (campusData.levels||[]).find(l => l.id === lid);
        if(lvl) renderRoomList(lvl);
      });

      // initial backend status indicator (may be updated by api_enhanced polling)
      updateBackendStatus(!!window.backendAvailable);
      if(window.backendAvailable){ try{ backendClassrooms = await window.getClassrooms(); mergeBackendClassrooms(); }catch(e){ console.warn(e); } }
    })();

  });
})();
