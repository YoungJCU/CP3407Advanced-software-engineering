// campus_hotspots.js
// Places clickable markers over the campus image; if saved coordinates exist on the backend,
// they are rendered; otherwise we distribute markers in a grid across the image area.
// Clicking a marker navigates to index_final.html?building=<name>.
(function(){
  document.addEventListener('DOMContentLoaded', () => {
    const img = document.getElementById('campusImg');
    const grid = document.getElementById('buildingGrid');
    if(!img) return;

    // gather building names from campus_mapped.json
    async function loadBuildings(){
      try{
        const res = await fetch('data/campus_mapped.json');
        if(!res.ok) return [];
        const data = await res.json();
        const map = new Map();
        (data.levels||[]).forEach(l => { const b = l.building || '默认建筑'; if(!map.has(b)) map.set(b, []); map.get(b).push(l); });
        return Array.from(map.keys());
      }catch(e){ console.warn('hotspots: failed to load campus data', e); return []; }
    }

    function createMarker(name, leftPct, topPct){
      const m = document.createElement('button');
      m.className = 'building-hotspot';
      m.textContent = name;
      m.style.position = 'absolute';
      m.style.left = leftPct + '%';
      m.style.top = topPct + '%';
      m.style.transform = 'translate(-50%,-50%)';
      m.style.padding = '6px 8px';
      m.style.borderRadius = '999px';
      m.style.background = 'rgba(255,255,255,0.9)';
      m.style.border = '1px solid #cbd5e1';
      m.style.cursor = 'pointer';
      m.style.fontSize = '13px';
      m.style.boxShadow = '0 6px 14px rgba(2,6,23,0.06)';
      m.addEventListener('click', () => {
        window.location.href = `./index_final.html?building=${encodeURIComponent(name)}`;
      });
      return m;
    }

    async function loadSavedHotspots(){
      try{
        const res = await fetch('/api/hotspots');
        if(!res.ok) return null;
        const j = await res.json();
        if(j && j.success) return j.data || [];
        return null;
      }catch(e){ console.warn('hotspots: failed to fetch saved hotspots', e); return null; }
    }

    async function saveHotspotToServer(name, leftPct, topPct){
      try{
        const res = await fetch('/api/hotspots', {method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({name, left_pct: leftPct, top_pct: topPct})});
        return await res.json();
      }catch(e){ console.warn('hotspots: failed to save hotspot', e); return null; }
    }

    (async function init(){
      const names = await loadBuildings();
      if(!names || names.length === 0){ grid.innerHTML = '<div class="placeholder">无建筑数据</div>'; }

      // overlay container
      const wrap = document.createElement('div');
      wrap.style.position = 'absolute';
      wrap.style.left = 0; wrap.style.top = 0; wrap.style.right = 0; wrap.style.bottom = 0;
      wrap.style.pointerEvents = 'none';
      wrap.id = '__campus_overlay__';
      img.parentElement.style.position = 'relative';
      img.parentElement.appendChild(wrap);

      // add edit controls
      const toolbar = document.createElement('div');
      toolbar.style.marginTop = '8px';
      toolbar.innerHTML = '<button id="__hotspot_edit_btn__" class="btn btn-ghost">编辑热点</button> <span style="color:#6b7280;margin-left:8px;font-size:13px">（启用后，点击图片添加热点）</span>';
      grid.parentElement.insertBefore(toolbar, grid);
      const editBtn = document.getElementById('__hotspot_edit_btn__');
      let editMode = false;

      editBtn.addEventListener('click', () => {
        editMode = !editMode;
        editBtn.textContent = editMode ? '退出编辑' : '编辑热点';
        wrap.style.pointerEvents = editMode ? 'auto' : 'none';
      });

      // try load saved hotspots from backend
      const saved = await loadSavedHotspots();
      if(Array.isArray(saved) && saved.length > 0){
        // render saved hotspots
        saved.forEach(h => {
          const marker = createMarker(h.name, Number(h.left_pct), Number(h.top_pct));
          marker.style.pointerEvents = 'auto';
          wrap.appendChild(marker);
        });
      } else {
        // fallback: render grid markers (one per building name)
        const n = names.length;
        if(n === 0) return;
        const cols = Math.ceil(Math.sqrt(n));
        const rows = Math.ceil(n / cols);
        let i = 0;
        for(let r=0;r<rows;r++){
          for(let c=0;c<cols;c++){
            if(i>=n) break;
            const leftPct = (c + 0.5) * (100/cols);
            const topPct = (r + 0.5) * (100/rows) * 0.75; // compress vertical layout a bit
            const marker = createMarker(names[i], leftPct, topPct);
            marker.style.pointerEvents = 'auto';
            wrap.appendChild(marker);
            i++;
          }
        }
      }

      // image click handler in edit mode: capture coordinates and prompt for name
      img.addEventListener('click', async (ev) => {
        if(!editMode) return;
        const rect = img.getBoundingClientRect();
        const x = ev.clientX - rect.left; // px
        const y = ev.clientY - rect.top;
        const leftPct = (x / rect.width) * 100;
        const topPct = (y / rect.height) * 100;

        // ask for building name (prefill first building if available)
        const defaultName = names && names.length ? names[0] : '';
        const name = window.prompt('输入建筑名（将作为热点标签并用于导航）', defaultName);
        if(!name) return alert('未输入名称，取消');

        // create marker visually immediately
        const marker = createMarker(name, leftPct, topPct);
        marker.style.pointerEvents = 'auto';
        wrap.appendChild(marker);

        // POST to backend
        const res = await saveHotspotToServer(name, leftPct, topPct);
        if(res && res.success){ alert('已保存热点'); }
        else { alert('无法保存热点到后端（请检查后端）'); }
      });

    })();

  });
})();
