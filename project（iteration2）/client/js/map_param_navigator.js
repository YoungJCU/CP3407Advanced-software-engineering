// map_param_navigator.js
// After the enhanced map renders, this script reads URL params (?building=...&level=...)
// and simulates clicks to open the requested building/level.
(function(){
  document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const bname = params.get('building');
    const levelId = params.get('level');
    if(!bname && !levelId) return;
    // Delay to allow the enhanced map script to render SVG elements
    setTimeout(() => {
      try{
        if(bname){
          // try to find a building title text node inside svg
          const texts = Array.from(document.querySelectorAll('#campusMap text'));
          const match = texts.find(t => t.textContent.trim().toLowerCase() === bname.trim().toLowerCase());
          if(match){
            // click the text which map script wired to open building
            match.dispatchEvent(new MouseEvent('click', {bubbles:true}));
            // then, if levelId provided, try to select level (after another short delay)
            if(levelId){ setTimeout(()=>{
              const sel = document.getElementById('levelSelect');
              if(sel){
                const opt = Array.from(sel.options).find(o=>o.value===levelId || o.text===levelId || o.text.toLowerCase().includes(levelId.toLowerCase()));
                if(opt){ sel.value = opt.value; sel.dispatchEvent(new Event('change')); }
              }
            }, 200); }
            return;
          }
        }
        if(levelId){
          // find level option globally
          const sel = document.getElementById('levelSelect');
          if(sel){ const opt = Array.from(sel.options).find(o=>o.value===levelId || o.text===levelId || o.text.toLowerCase().includes(levelId.toLowerCase())); if(opt){ sel.value = opt.value; sel.dispatchEvent(new Event('change')); } }
        }
      }catch(e){ console.warn('map_param_navigator failed', e); }
    }, 350);
  });
})();

