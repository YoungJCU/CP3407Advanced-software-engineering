// campus_map.js - renders building cards and navigates to enhanced map page
(async function(){
  const grid = document.getElementById('buildingGrid');
  const img = document.getElementById('campusImg');
  const placeholder = document.getElementById('campusPlaceholder');
  try{
    const res = await fetch('data/campus_mapped.json');
    if(!res.ok) throw new Error('no campus_mapped.json');
    const data = await res.json();
    const buildings = {};
    (data.levels || []).forEach(l => { const b = l.building || '默认建筑'; buildings[b] = buildings[b] || []; buildings[b].push(l); });
    if(Object.keys(buildings).length === 0){ grid.innerHTML = '<div class="placeholder">无建筑数据</div>'; return; }
    for(const [name, levels] of Object.entries(buildings)){
      const c = document.createElement('div'); c.className = 'building-card'; c.textContent = `${name} · ${levels.length} 层`;
      c.addEventListener('click', () => {
        // navigate to enhanced map; pass building name (encoded)
        const url = `./index_final.html?building=${encodeURIComponent(name)}`;
        window.location.href = url;
      });
      grid.appendChild(c);
    }
  }catch(e){
    console.warn('campus_map: failed to load campus data', e);
    grid.innerHTML = '<div class="placeholder">无法加载 campus_mapped.json（请确保 data/campus_mapped.json 可用）</div>';
  }

  // show placeholder if campus image not found
  if(img && img.style && img.complete === false){ /* image still loading */ }
  if(img && img.style && img.offsetParent === null){ // image hidden by onerror
    if(placeholder) placeholder.style.display = 'block';
  }
})();
