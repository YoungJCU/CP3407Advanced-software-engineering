document.addEventListener('DOMContentLoaded', async () => {
  const loginModal = document.getElementById('loginModal');
  const loginForm = document.getElementById('loginForm');
  const usernameInput = document.getElementById('loginUsername');
  const passwordInput = document.getElementById('password');
  const appContent = document.getElementById('appContent');
  const userNameSpan = document.getElementById('userDisplay');
  const logoutBtn = document.getElementById('logoutBtn');

  const details = document.getElementById('details');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  // New campus controls
  const levelSelect = document.getElementById('levelSelect');
  const buildingSelect = document.getElementById('buildingSelect');
  const roomList = document.getElementById('roomList');

  let classrooms = [];
  let campusData = null;

  const loadStatusEl = document.getElementById('loadStatus');

  function updateLoadStatus(msg, details) {
    if(!loadStatusEl) return;
    loadStatusEl.textContent = msg + (details ? (' — ' + details) : '');
  }

  // Add debug controls to loadStatus area for quick verification
  function ensureDebugControls(){
    if(!loadStatusEl) return;
    if(document.getElementById('__reloadDataBtn__')) return; // already added
    const reloadBtn = document.createElement('button');
    reloadBtn.id = '__reloadDataBtn__';
    reloadBtn.textContent = 'Reload 数据';
    reloadBtn.className = 'btn btn-ghost';
    reloadBtn.style.marginLeft = '12px';
    reloadBtn.addEventListener('click', async () => {
      updateLoadStatus('正在重新加载数据...');
      await loadCampusData();
      await loadClassrooms();
      updateLoadStatus('已重新加载（请查看房间列表或 SVG）');
    });

    const showBtn = document.createElement('button');
    showBtn.id = '__showRawBtn__';
    showBtn.textContent = '显示原始数据';
    showBtn.className = 'btn btn-ghost';
    showBtn.style.marginLeft = '8px';

    const pre = document.createElement('pre');
    pre.id = '__debugDump__';
    pre.style.display = 'none';
    pre.style.maxHeight = '200px';
    pre.style.overflow = 'auto';
    pre.style.background = '#f8fafc';
    pre.style.border = '1px solid #e6eef8';
    pre.style.padding = '8px';
    pre.style.marginTop = '8px';

    showBtn.addEventListener('click', () => {
      if(pre.style.display === 'none'){
        pre.style.display = 'block';
        pre.textContent = JSON.stringify(campusData || {}, null, 2);
        showBtn.textContent = '隐藏原始数据';
      } else {
        pre.style.display = 'none';
        showBtn.textContent = '显示原始数据';
      }
    });

    loadStatusEl.appendChild(reloadBtn);
    loadStatusEl.appendChild(showBtn);
    loadStatusEl.appendChild(pre);
  }

  function showLogin(){
    loginModal.style.display = 'flex';
    // keep app content visible under the modal so the map renders even if not logged in
    // appContent.style.display = 'none';
    logoutBtn.style.display = 'none';
    userNameSpan.textContent = '';
  }

  function showApp(name){
    loginModal.style.display = 'none';
    appContent.style.display = 'block';
    logoutBtn.style.display = 'inline-block';
    userNameSpan.textContent = name;
  }

  // Check existing login
  const existing = localStorage.getItem('campus_user');
  if(existing){
    showApp(existing);
  } else {
    showLogin();
  }

  // Login form submit (local simulated)
  loginForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const name = usernameInput.value.trim();
    if(!name){ alert('请输入用户名'); return; }
    localStorage.setItem('campus_user', name);
    showApp(name);
    // clear password field for UX
    passwordInput.value = '';
    // load classrooms and campus data once logged in
    loadCampusData();
    loadClassrooms();
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('campus_user');
    showLogin();
  });

  async function loadCampusData(){
    // Try to load mapped file first (created by import script), fallback to campus.json
    const bust = Date.now();
    try{
      let res = await fetch(`data/campus_mapped.json?_=${bust}`);
      if(res.ok){
        campusData = await res.json();
        const levels = (campusData.levels || []).length;
        const rooms = (campusData.levels || []).reduce((acc,l)=> acc + ((l.rooms||[]).length), 0);
        updateLoadStatus('已加载: campus_mapped.json', `楼层 ${levels}, 房间 ${rooms}`);
        console.log('Loaded campus_mapped.json', campusData);
        populateLevelSelect();
        // update debug dump if present
        const dbg = document.getElementById('__debugDump__');
        if(dbg){ dbg.style.display='block'; dbg.textContent = JSON.stringify(campusData, null, 2); }
        return;
      } else {
        const text = await res.text().catch(()=>'<no body>');
        console.warn('campus_mapped.json HTTP', res.status, text.slice(0,200));
        updateLoadStatus(`campus_mapped.json 返回 ${res.status}`, text.slice(0,200));
      }
    }catch(e){
      console.warn('加载 campus_mapped.json 失败：', e);
      updateLoadStatus('未能加载 campus_mapped.json（网络或路径问题），尝试 campus.json');
    }

    try{
      const res2 = await fetch(`data/campus.json?_=${bust}`);
      if(!res2.ok){
        const t = await res2.text().catch(()=>'<no body>');
        throw new Error(`HTTP ${res2.status}: ${t.slice(0,200)}`);
      }
      campusData = await res2.json();
      const levels = (campusData.levels || []).length;
      const rooms = (campusData.levels || []).reduce((acc,l)=> acc + ((l.rooms||[]).length), 0);
      updateLoadStatus('已加载: campus.json (fallback)', `楼层 ${levels}, 房间 ${rooms}`);
      console.log('Loaded campus.json', campusData);
      populateLevelSelect();
      const dbg2 = document.getElementById('__debugDump__');
      if(dbg2){ dbg2.style.display='block'; dbg2.textContent = JSON.stringify(campusData, null, 2); }
    }catch(err){
      console.warn('加载 campus.json 失败：', err);
      campusData = null;
      levelSelect.innerHTML = '<option value="">(无数据)</option>';
      buildingSelect.innerHTML = '<option value="">(无数据)</option>';
      updateLoadStatus('未能加载任何 campus 数据，请检查 /data/campus_mapped.json 或 /data/campus.json 的可访问性；详见控制台');
    }
  }

  function populateLevelSelect(){
    if(!campusData || !campusData.levels) return;
    levelSelect.innerHTML = campusData.levels.map(l => `<option value="${l.id}">${l.name}</option>`).join('');
    // select first level by default
    if(campusData.levels.length) {
      levelSelect.value = campusData.levels[0].id;
      populateBuildingSelect(campusData.levels[0].id);
    }
  }

  function populateBuildingSelect(levelId){
    const level = (campusData.levels || []).find(l => l.id === levelId);
    if(!level){ buildingSelect.innerHTML = '<option value="">(无建筑)</option>'; return; }
    // For this simpler structure we treat each level as single building (or use level.building)
    // Put a single option that reflects the level's building
    buildingSelect.innerHTML = `<option value="${levelId}">${level.building || level.name}</option>`;
    renderRoomListByLevel(levelId);
  }

  function renderRoomListByLevel(levelId){
    const level = (campusData.levels || []).find(l => l.id === levelId);
    if(!level){ roomList.innerHTML = '<div style="color:var(--muted)">此楼层无数据</div>'; return; }
    if(!level.rooms || level.rooms.length === 0){ roomList.innerHTML = '<div style="color:var(--muted)">此楼层暂无房间数据</div>'; return; }
    const html = level.rooms.map(r => `
      <div class="room-item" data-id="${r.id===null? '' : r.id}" data-name="${escapeHtml(r.name)}" data-key="${escapeHtml(normalizeName(r.name))}">${escapeHtml(r.name)}</div>
    `).join('');
    roomList.innerHTML = html;
    // bind clicks with name-based matching
    roomList.querySelectorAll('.room-item').forEach(item => {
      item.addEventListener('click', async () => {
        const dataId = item.getAttribute('data-id');
        const dataName = item.getAttribute('data-name');
        const dataKey = item.getAttribute('data-key');
        // prefer selecting svg by data-key (normalized) first
        const target = document.querySelector(`svg [data-key='${dataKey}']`) || document.querySelector(`svg [data-id='${dataId}']`) || document.querySelector(`svg [data-name='${dataName}']`);
        if(dataId){
          // numeric id present -> load backend detail
          await showRoomDetails(dataId, target);
        } else {
          // try to find matching classroom by name in loaded backend classrooms
          const match = findMatchingClassroomByName(dataName);
          if(match){
            await showRoomDetails(match.id, target);
          } else {
            // fallback: show local metadata
            showLocalRoomDetails(dataName, level);
          }
        }
      });
    });

    // Also render an SVG map for this level so rooms are clickable on the map
    renderSvgForLevel(levelId);
  }

  // Render a simple grid-based SVG floor plan for the selected level
  function renderSvgForLevel(levelId){
    const svg = document.getElementById('campusMap');
    // clear existing children
    while(svg.firstChild) svg.removeChild(svg.firstChild);

    const level = (campusData.levels || []).find(l => l.id === levelId);
    if(!level || !level.rooms) return;

    const rooms = level.rooms;
    // layout params
    const cols = 3; // number of columns in grid
    const boxW = 180;
    const boxH = 90;
    const gapX = 24;
    const gapY = 20;
    const startX = 40;
    const startY = 40;

    svg.setAttribute('viewBox', `0 0 ${Math.max(720, startX*2 + (boxW+gapX)*cols)} ${Math.max(480, startY*2 + Math.ceil(rooms.length/cols)*(boxH+gapY))}`);

    rooms.forEach((r, idx) => {
      const row = Math.floor(idx / cols);
      const col = idx % cols;
      const x = startX + col * (boxW + gapX);
      const y = startY + row * (boxH + gapY);

      const ns = 'http://www.w3.org/2000/svg';
      const rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', x);
      rect.setAttribute('y', y);
      rect.setAttribute('width', boxW);
      rect.setAttribute('height', boxH);
      rect.setAttribute('rx', 10);
      rect.setAttribute('fill', '#fff');
      rect.setAttribute('stroke', '#cbd5e1');
      rect.setAttribute('data-name', r.name);
      // add normalized key for reliable querying
      rect.setAttribute('data-key', normalizeName(r.name));
      if(r.id) rect.setAttribute('data-id', r.id);
      rect.classList.add('map-room');

      const text = document.createElementNS(ns, 'text');
      text.setAttribute('x', x + 12);
      text.setAttribute('y', y + 28);
      text.setAttribute('class', 'room-label');
      // add data-key to text as well so clicks on text can be matched
      text.setAttribute('data-key', normalizeName(r.name));
      text.textContent = r.name;

      // small subtitle for availability if backend matched
      const subtitle = document.createElementNS(ns, 'text');
      subtitle.setAttribute('x', x + 12);
      subtitle.setAttribute('y', y + 54);
      subtitle.setAttribute('class', 'room-sub');
      subtitle.setAttribute('fill', '#6b7280');
      subtitle.setAttribute('font-size', '12');
      subtitle.textContent = r.id ? `ID ${r.id}` : '';
      subtitle.setAttribute('data-key', normalizeName(r.name));

      svg.appendChild(rect);
      svg.appendChild(text);
      svg.appendChild(subtitle);

      // Bind click handler
      rect.style.cursor = 'pointer';
      rect.addEventListener('click', async () => {
        const dataId = rect.getAttribute('data-id');
        const dataName = rect.getAttribute('data-name');
        const dataKey = rect.getAttribute('data-key');
        if(dataId){
          await showRoomDetails(dataId, rect);
        } else {
          const match = findMatchingClassroomByName(dataName);
          if(match) await showRoomDetails(match.id, rect);
          else showLocalRoomDetails(dataName, level);
        }
      });

      // Also allow clicking the text to act like clicking the rect
      text.style.cursor = 'pointer';
      text.addEventListener('click', () => rect.dispatchEvent(new Event('click')));
      subtitle.style.cursor = 'pointer';
      subtitle.addEventListener('click', () => rect.dispatchEvent(new Event('click')));
    });
  }

  // helper: escape HTML for insertion in attributes
  function escapeHtml(str){
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function normalizeName(s){
    return (s||'').toLowerCase().replace(/[\s\-_:,\(\)\/\\]+/g,' ').replace(/[^a-z0-9 ]/g,'').trim();
  }

  // Mapping storage (name -> backend id)
  const MAPPING_KEY = 'campus_room_map';
  function loadMappings(){
    try{ return JSON.parse(localStorage.getItem(MAPPING_KEY) || '{}'); }catch(e){ return {}; }
  }
  function saveMappings(m){ localStorage.setItem(MAPPING_KEY, JSON.stringify(m)); }
  let mappings = loadMappings();

  // Update findMatchingClassroomByName to consult mappings first
  function findMatchingClassroomByName(name){
    if(!name) return null;
    // check explicit mapping
    const nkey = normalizeName(name);
    if(mappings && mappings[nkey]){
      // find backend classroom with this id
      const byId = classrooms.find(c => String(c.id) === String(mappings[nkey]));
      if(byId) return byId;
    }
    if(!classrooms || classrooms.length===0) return null;
    const n = normalizeName(name);
    // 1) exact normalized match
    let found = classrooms.find(c => normalizeName(c.name) === n);
    if(found) return found;
    // 2) contains match (name contains or is contained)
    found = classrooms.find(c => normalizeName(c.name).includes(n) || n.includes(normalizeName(c.name)));
    if(found) return found;
    // 3) fallback: fuzzy by words intersection
    const nameWords = new Set(n.split(' ').filter(Boolean));
    let best = null; let bestScore = 0;
    for(const c of classrooms){
      const cw = normalizeName(c.name).split(' ').filter(Boolean);
      const score = cw.reduce((acc,w)=> acc + (nameWords.has(w)?1:0),0);
      if(score>bestScore){ bestScore = score; best = c; }
    }
    if(bestScore>0) return best;
    return null;
  }

  function showLocalRoomDetails(roomName, level){
    // Render a fallback details view using campusData and include mapping UI
    const mappingsList = Object.entries(mappings).map(([k,v]) => `${k}:${v}`).join(',');
    const safeName = escapeHtml(roomName || '');
    let out = `
      <div style="font-weight:700;font-size:16px;margin-bottom:6px">${safeName}</div>
      <div style="color:var(--muted);margin-bottom:6px">${level ? escapeHtml(level.name) : ''} — ${escapeHtml(level ? level.building || '' : '')}</div>
      <div style="color:var(--muted);margin-bottom:6px">${level ? escapeHtml(level.description || '') : ''}</div>
      <div style="margin-top:6px;color:var(--muted)">此房间尚未与后端教室匹配；你可以将其映射到后端教室以启用详情视图。</div>
    `;

    // build mapping control if backend classrooms are loaded
    if(classrooms && classrooms.length){
      out += '<div style="margin-top:10px">映射到后端教室：<select id="__mappingSelect__"><option value="">(选择教室)</option>';
      out = out.replace('</select>', '');
      // We'll inject options programmatically below to avoid escaping issues
    }

    details.innerHTML = out;

    // Remove selection
    document.querySelectorAll('svg [data-id]').forEach(r => r.classList.remove('selected'));
    // try find svg by normalized data-key attribute
    const key = normalizeName(roomName || '');
    const svgByKey = document.querySelector(`svg [data-key='${key}']`);
    if(svgByKey) svgByKey.classList.add('selected');

    // If classrooms are loaded, render mapping dropdown and save button
    if(classrooms && classrooms.length){
      const sel = document.createElement('select');
      sel.id = '__mappingSelect__';
      const emptyOpt = document.createElement('option'); emptyOpt.value=''; emptyOpt.textContent='(选择教室)'; sel.appendChild(emptyOpt);
      classrooms.forEach(c => {
        const o = document.createElement('option'); o.value = c.id; o.textContent = `${c.name} (${c.building||''})`; sel.appendChild(o);
      });
      const btn = document.createElement('button'); btn.className='btn btn-primary'; btn.textContent='保存映射';
      btn.style.marginLeft='8px';
      const container = document.createElement('div'); container.style.marginTop='10px'; container.appendChild(sel); container.appendChild(btn);
      details.appendChild(container);

      btn.addEventListener('click', () => {
        const selVal = sel.value;
        if(!selVal){ alert('请选择一个后端教室'); return; }
        // store mapping
        const key = normalizeName(roomName);
        mappings[key] = selVal;
        saveMappings(mappings);
        // also apply to campusData in memory
        for(const lvl of campusData.levels || []){
          for(const r of lvl.rooms || []){
            if(normalizeName(r.name) === key){ r.id = selVal; }
          }
        }
        alert('已保存映射');
        // now open backend detail
        const target = document.querySelector(`svg [data-id='${selVal}']`);
        showRoomDetails(selVal, target);
      });
    }
  }

  async function loadClassrooms(){
    details.innerText = '加载教室数据中...';
    try{
      classrooms = await getClassrooms();
      details.innerText = '点击地图中的教室以查看详细信息。';
      // wire up map elements
      document.querySelectorAll('svg [data-id]').forEach(el => {
        const id = el.getAttribute('data-id');
        el.style.cursor = 'pointer';
        el.addEventListener('click', async () => {
          // if svg has data-id, use it; else try name attr
          const targetId = id || el.getAttribute('data-name');
          if(targetId) await showRoomDetails(targetId, el);
          else {
            // try to match by nearby text label
            const text = el.nextElementSibling && el.nextElementSibling.textContent ? el.nextElementSibling.textContent : null;
            const m = findMatchingClassroomByName(text);
            if(m) await showRoomDetails(m.id, el);
            else showLocalRoomDetails(text, null);
          }
        });
      });

      // After loading backend classrooms, merge any backend-only rooms into campusData so they show up on the map
      await mergeBackendClassrooms();

    }catch(err){
      details.innerText = '无法加载教室：' + (err.message || err);
    }
  }

  // Merge backend classrooms into campusData if some backend classrooms are not represented in campusData
  async function mergeBackendClassrooms(){
    try{
      if(!campusData) return;
      // classrooms should already be loaded; if not, fetch
      if(!classrooms || classrooms.length===0){
        try{ classrooms = await getClassrooms(); }catch(e){ console.warn('无法加载后端教室用于合并', e); return; }
      }
      const existingKeys = new Set();
      (campusData.levels||[]).forEach(l => (l.rooms||[]).forEach(r => existingKeys.add(normalizeName(r.name))));
      const unmatched = [];
      classrooms.forEach(c => {
        if(!existingKeys.has(normalizeName(c.name))){
          unmatched.push(c);
        }
      });
      if(unmatched.length === 0) return;
      // Try to place unmatched by floor -> level, else add to a special level
      let otherLevel = campusData.levels.find(l => l.id === 'backend-imported');
      for(const b of unmatched){
        let placed = false;
        if(typeof b.floor === 'number' || (b.floor && !isNaN(Number(b.floor)))){
          const bf = Number(b.floor);
          for(const lvl of campusData.levels){
            const m = (lvl.id || lvl.name || '').match(/\d+/);
            if(m && Number(m[0]) === bf){
              lvl.rooms = lvl.rooms || [];
              lvl.rooms.push({ id: b.id, name: b.name });
              placed = true; break;
            }
          }
        }
        if(!placed){
          if(!otherLevel){
            otherLevel = { id: 'backend-imported', name: '其他（后端）', building: '', description: '来自后端但未在 campus.json 中列出的教室', rooms: [] };
            campusData.levels.push(otherLevel);
          }
          otherLevel.rooms.push({ id: b.id, name: b.name });
        }
      }
      // refresh level select and current view
      populateLevelSelect();
      // ensure current level is rendered
      if(levelSelect.value) renderRoomListByLevel(levelSelect.value);
      console.log('Merged', unmatched.length, 'backend-only classrooms into campusData');
    }catch(e){
      console.warn('mergeBackendClassrooms failed', e);
    }
  }

  // If already logged in at page load, load campus data and classrooms
  if(localStorage.getItem('campus_user')){
    loadCampusData();
    loadClassrooms();
  }

  // ALSO load campus data and classrooms regardless of login so the SVG map and room list are rendered
  // This ensures the map shows all rooms (from campus_mapped.json) even before login.
  loadCampusData();
  loadClassrooms();

});
