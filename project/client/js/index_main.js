/**
 * Campus map + English UI + search (API with local fallback).
 */
(function () {
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const overlay = document.getElementById('campusOverlay');
      const img = document.getElementById('campusImg');
      const details = document.getElementById('details');
      const levelSelect = document.getElementById('levelSelect');
      const buildingSelect = document.getElementById('buildingSelect');
      const roomList = document.getElementById('roomList');
      const svg = document.getElementById('campusMap');
      const loginStatus = document.getElementById('loginStatus');
      const levelRoomPanel = document.getElementById('levelRoomPanel');
      const campusSearch = document.getElementById('campusSearch');
      const searchResults = document.getElementById('searchResults');
      const searchHint = document.getElementById('searchHint');

      let campusData = null;
      let blockMap = null;
      let levelMap = new Map();
      let currentLevel = null;
      let courseSearchIndex = {};

      function escapeHtml(s) {
        return String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }

      function norm(s) {
        return String(s || '')
          .toLowerCase()
          .replace(/\s+/g, ' ')
          .trim();
      }

      function levelIdToFloor(levelId) {
        const m = String(levelId).match(/(\d+)/);
        return m ? parseInt(m[1], 10) : 1;
      }

      function refreshLoginStatus() {
        const user = localStorage.getItem('nav_user');
        if (user) {
          loginStatus.innerHTML =
            `Signed in as <strong>${escapeHtml(user)}</strong> · <a href="login.html">Change</a> · ` +
            `<button type="button" id="logoutBtn" class="btn" style="padding:4px 10px;font-size:13px;margin-left:4px">Sign out</button>`;
          const lb = document.getElementById('logoutBtn');
          if (lb) {
            lb.addEventListener('click', () => {
              try {
                localStorage.removeItem('nav_user');
                localStorage.removeItem('nav_user_pass');
              } catch (e) { /* ignore */ }
              refreshLoginStatus();
            });
          }
        } else {
          loginStatus.innerHTML = '<a href="login.html">Sign in</a>';
        }
      }
      refreshLoginStatus();

      const mainEl = document.querySelector('main');
      if (window.location.protocol === 'file:' && mainEl) {
        const w = document.createElement('div');
        w.setAttribute('role', 'alert');
        w.style.cssText =
          'margin-bottom:12px;padding:12px 14px;border-radius:10px;background:#fef3c7;border:1px solid #f59e0b;color:#92400e;font-size:14px;line-height:1.55';
        w.innerHTML =
          '<strong>Opened as a local file (file://)</strong> — the browser blocks loading <code>data/*.json</code> and the API, so the map stays empty.<br>' +
          '<strong>本地用「文件」打开时</strong>，浏览器会阻止读取地图数据。请先在 <code>project/server</code> 运行 <code>npm start</code>，再用 <strong>http://localhost:3000/</strong> 访问。<br>' +
          '<span style="font-size:13px">Why: security rules for <code>fetch()</code> from disk, not a project bug.</span>';
        mainEl.insertBefore(w, mainEl.firstChild);
      }

      if (img && img.parentElement) {
        img.parentElement.style.position = 'relative';
        img.addEventListener('error', () => { img.style.display = 'none'; });
      }

      async function loadJson(path) {
        try {
          const r = await fetch(path);
          if (!r.ok) return null;
          return await r.json();
        } catch (e) {
          return null;
        }
      }

      function layoutOverlayToImage() {
        if (!img || !overlay) return;
        overlay.style.left = `${img.offsetLeft}px`;
        overlay.style.top = `${img.offsetTop}px`;
        overlay.style.width = `${img.offsetWidth}px`;
        overlay.style.height = `${img.offsetHeight}px`;
      }

      async function waitForCampusImageReady() {
        if (!img) return;
        if (img.decode) {
          try {
            await img.decode();
          } catch (e) { /* ignore */ }
        } else if (!img.complete) {
          await new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
          });
        }
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
      }

      function highlightHotspot(id) {
        overlay.querySelectorAll('.building-hotspot').forEach((el) => {
          el.classList.toggle('selected', el.getAttribute('data-block-id') === id);
        });
      }

      function navigateToLevelRoomUI() {
        if (!levelRoomPanel) return;
        levelRoomPanel.classList.remove('level-room-navflash');
        void levelRoomPanel.offsetWidth;
        levelRoomPanel.classList.add('level-room-navflash');
        levelRoomPanel.addEventListener('animationend', function onEnd() {
          levelRoomPanel.removeEventListener('animationend', onEnd);
          levelRoomPanel.classList.remove('level-room-navflash');
        });
        levelRoomPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        try {
          levelRoomPanel.focus({ preventScroll: true });
        } catch (e) { /* ignore */ }
      }

      function createHotspot(label, leftPct, topPct, id) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'building-hotspot';
        b.textContent = label;
        b.style.position = 'absolute';
        b.style.left = leftPct + '%';
        b.style.top = topPct + '%';
        // center the hotspot; rotation will be applied around its center
        b.style.transformOrigin = '50% 50%';
        b.style.transform = 'translate(-50%,-50%)';
        b.style.pointerEvents = 'auto';
        b.setAttribute('data-block-id', id || label);
        b.setAttribute('data-left', leftPct);
        b.setAttribute('data-top', topPct);
        return b;
      }

      // The original simple hotspot creation loop (below) already inserts clickable buttons
      // into the overlay; keep a no-op function here for compatibility with other code.
      function renderBlockHotspots() {
        // no-op: preserve original behavior of the simpler insertion above.
      }

      function renderSvgForLevel(level) {
        if (!svg) return;
        while (svg.firstChild) svg.removeChild(svg.firstChild);
        const ns = 'http://www.w3.org/2000/svg';
        const rooms = level.rooms || [];
        const cols = 3;
        const boxW = 180;
        const boxH = 90;
        const gapX = 20;
        const gapY = 18;
        const startX = 20;
        const startY = 20;
        svg.setAttribute('viewBox', '0 0 760 520');
        rooms.forEach((r, idx) => {
          const row = Math.floor(idx / cols);
          const col = idx % cols;
          const x = startX + col * (boxW + gapX);
          const y = startY + row * (boxH + gapY);
          const rect = document.createElementNS(ns, 'rect');
          rect.setAttribute('x', x);
          rect.setAttribute('y', y);
          rect.setAttribute('width', boxW);
          rect.setAttribute('height', boxH);
          rect.setAttribute('rx', 10);
          rect.setAttribute('fill', '#fff');
          rect.setAttribute('stroke', '#cbd5e1');
          if (r.id != null) rect.setAttribute('data-id', r.id);
          const text = document.createElementNS(ns, 'text');
          text.setAttribute('x', x + 12);
          text.setAttribute('y', y + 28);
          text.textContent = r.name;
          svg.appendChild(rect);
          svg.appendChild(text);
          rect.style.cursor = 'pointer';
          text.style.cursor = 'pointer';
          const onPick = () => { showRoomDetails(r, level); };
          rect.addEventListener('click', onPick);
          text.addEventListener('click', onPick);
        });
      }

      function showLocalDetails(room, level) {
        details.innerHTML =
          `<div style="font-weight:700">${escapeHtml(room.name)}</div>` +
          `<div style="color:#6b7280;margin-top:6px">${escapeHtml(level.name)} — ${escapeHtml(level.building || '')}</div>` +
          `<div style="color:#6b7280;margin-top:6px">${escapeHtml(level.description || '')}</div>` +
          (window.backendAvailable === false
            ? '<p style="margin-top:8px;font-size:13px;color:#92400e">Server offline — timetable and seating are not loaded.</p>'
            : '<p style="margin-top:8px;font-size:13px;color:#92400e">Could not load this room from the server.</p>');
      }

      function renderBackendDetails(data) {
        const courses = Array.isArray(data.courses) ? data.courses : [];
        const trimester = courses.length && courses[0].trimester ? courses[0].trimester : '';
        const courseHtml = courses.length
          ? '<div style="margin-top:10px;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">' +
            '<thead><tr style="text-align:left;border-bottom:1px solid #e5e7eb;color:#64748b">' +
            '<th style="padding:6px 4px">Code</th><th style="padding:6px 4px">Type</th><th style="padding:6px 4px">Module</th><th style="padding:6px 4px">When</th></tr></thead><tbody>' +
            courses.map((c) => {
              const code = c.courseCode || '—';
              const typ = c.sessionType || '—';
              const when = `${escapeHtml(c.dayOfWeek || '')} ${escapeHtml(c.startTime || '')}–${escapeHtml(c.endTime || '')}`;
              return `<tr style="border-bottom:1px solid #f1f5f9"><td style="padding:6px 4px;font-weight:600">${escapeHtml(code)}</td>` +
                `<td style="padding:6px 4px;color:#64748b">${escapeHtml(typ)}</td>` +
                `<td style="padding:6px 4px">${escapeHtml(c.courseName || '')}</td>` +
                `<td style="padding:6px 4px;white-space:nowrap;color:#475569">${when}</td></tr>`;
            }).join('') +
            '</tbody></table></div>'
          : '<p style="margin-top:8px;color:#6b7280">No sessions listed for this room.</p>';

        details.innerHTML =
          `<div style="font-weight:700">${escapeHtml(data.name || 'Room')}</div>` +
          `<div style="color:#6b7280;margin-top:6px">${escapeHtml(data.building || '')} · Floor ${escapeHtml(String(data.floor != null ? data.floor : ''))}</div>` +
          `<div style="margin-top:6px">Seats: ${escapeHtml(String(data.availableSeats != null ? data.availableSeats : '?'))} free / ${escapeHtml(String(data.totalSeats != null ? data.totalSeats : '?'))} total</div>` +
          (trimester ? `<div style="margin-top:8px;font-size:13px;color:#334155">Term: <strong>${escapeHtml(trimester)}</strong></div>` : '') +
          `<div style="margin-top:10px;font-weight:600">Timetable</div>` +
          courseHtml;
      }

      async function showRoomDetails(room, level) {
        roomList.querySelectorAll('.room-item').forEach((el) => {
          el.classList.toggle('selected-room', el.textContent === room.name);
        });
        if (window.getClassroomById && room.id != null && window.backendAvailable) {
          try {
            const data = await window.getClassroomById(room.id);
            renderBackendDetails(data);
            return;
          } catch (e) {
            /* fall through */
          }
        }
        showLocalDetails(room, level);
      }

      function renderRoomList(level) {
        if (!roomList) return;
        currentLevel = level;
        roomList.innerHTML = '';
        if (!level || !level.rooms || !level.rooms.length) {
          roomList.innerHTML = '<div style="color:#6b7280">No rooms on this floor.</div>';
          renderSvgForLevel({ rooms: [] });
          return;
        }
        level.rooms.forEach((r) => {
          const div = document.createElement('div');
          div.className = 'room-item';
          div.textContent = r.name;
          div.addEventListener('click', () => { showRoomDetails(r, level); });
          roomList.appendChild(div);
        });
        renderSvgForLevel(level);
      }

      function focusRoomById(roomId) {
        const level = (campusData.levels || []).find((l) => (l.rooms || []).some((r) => r.id === roomId));
        if (!level) return false;
        const room = level.rooms.find((r) => r.id === roomId);
        const buildingName = level.building || 'Main Campus';
        buildingSelect.innerHTML = `<option value="${escapeHtml(buildingName)}">${escapeHtml(buildingName)}</option>`;
        levelSelect.innerHTML = (campusData.levels || []).map((l) =>
          `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`
        ).join('');
        levelSelect.value = level.id;
        renderRoomList(level);
        showRoomDetails(room, level);
        const blk =
          (blockMap.blocks || []).find((b) => b.levelId === level.id && b.id === 'BlockA') ||
          (blockMap.blocks || []).find((b) => b.levelId === level.id);
        if (blk) {
          const bid = blk.id || blk.label;
          window.history.pushState({ block: bid }, '', window.location.pathname + '?block=' + encodeURIComponent(bid));
          highlightHotspot(bid);
        }
        navigateToLevelRoomUI();
        return true;
      }

      function buildLocalSearchRows(q) {
        const n = norm(q);
        const map = new Map();
        for (const level of campusData.levels || []) {
          const floor = levelIdToFloor(level.id);
          const levelHit = norm(`${level.name} ${level.id} ${level.description || ''}`).includes(n);
          for (const room of level.rooms || []) {
            const roomHit = norm(room.name).includes(n);
            if (!levelHit && !roomHit) continue;
            map.set(room.id, {
              classroom: { id: room.id, name: room.name, building: level.building, floor },
              courses: [],
              levelId: level.id,
              levelName: level.name,
              offlineOnly: true,
            });
          }
        }
        for (const cidStr of Object.keys(courseSearchIndex || {})) {
          const hay = courseSearchIndex[cidStr];
          if (!hay || !norm(String(hay)).includes(n)) continue;
          const id = Number(cidStr);
          if (!Number.isFinite(id)) continue;
          const level = (campusData.levels || []).find((l) => (l.rooms || []).some((r) => r.id === id));
          if (!level) continue;
          const room = level.rooms.find((r) => r.id === id);
          if (!room) continue;
          const floor = levelIdToFloor(level.id);
          if (!map.has(id)) {
            map.set(id, {
              classroom: { id: room.id, name: room.name, building: level.building, floor },
              courses: [],
              levelId: level.id,
              levelName: level.name,
              offlineOnly: true,
            });
          }
        }
        return Array.from(map.values());
      }

      function formatCoursePreview(courses, max, query) {
        const n = norm(query);
        let list = (courses || []).slice();
        if (n && list.length) {
          const scored = list.map((co) => {
            const blob = norm([co.courseCode, co.courseName, co.dayOfWeek, co.sessionType, co.startTime, co.endTime, co.trimester].join(' '));
            return { co, hit: blob.includes(n) };
          });
          scored.sort((a, b) => (b.hit ? 1 : 0) - (a.hit ? 1 : 0));
          list = scored.map((x) => x.co);
        }
        return list
          .slice(0, max)
          .map((co) => {
            const bits = [co.courseCode, co.courseName, co.dayOfWeek, co.startTime && co.endTime ? `${co.startTime}–${co.endTime}` : ''].filter(Boolean);
            return bits.join(' · ');
          })
          .filter(Boolean)
          .join(' · ');
      }

      async function runSearch() {
        if (!campusSearch || !searchResults || !campusData) return;
        const q = campusSearch.value.trim();
        searchResults.innerHTML = '';
        if (!q) return;

        let rows = [];
        try {
          if (window.backendAvailable && typeof window.searchCampus === 'function') {
            rows = await window.searchCampus(q);
          }
        } catch (e) {
          rows = [];
        }
        if (rows.length === 0) {
          rows = buildLocalSearchRows(q);
        }
        if (searchHint) {
          searchHint.textContent = window.backendAvailable
            ? 'Rooms, floors, module codes, titles, session types, days, times, and term. Select a result to open details.'
            : 'Rooms, floors, and module keywords (local index). Connect the server for live timetables.';
        }

        if (rows.length === 0) {
          searchResults.innerHTML = '<p class="search-empty">No matches.</p>';
          return;
        }

        rows.forEach((row) => {
          const c = row.classroom;
          const preview = formatCoursePreview(row.courses, 5, q);
          const offlineNote = row.offlineOnly && !preview ? 'Open room on the map for full details when the server is running.' : '';
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'search-hit';
          const meta = `${row.levelName || '—'} · Floor ${c.floor != null ? c.floor : '—'} · ${c.building || ''}`;
          btn.innerHTML =
            `<strong>${escapeHtml(c.name)}</strong>` +
            `<span class="meta">${escapeHtml(meta)}</span>` +
            (preview ? `<div class="preview">${escapeHtml(preview)}</div>` : '') +
            (offlineNote ? `<div class="preview">${escapeHtml(offlineNote)}</div>` : '');
          btn.addEventListener('click', () => {
            focusRoomById(c.id);
            campusSearch.value = '';
            searchResults.innerHTML = '';
          });
          searchResults.appendChild(btn);
        });
      }

      let searchDebounce = null;
      if (campusSearch) {
        campusSearch.addEventListener('input', () => {
          clearTimeout(searchDebounce);
          searchDebounce = setTimeout(runSearch, 300);
        });
        campusSearch.addEventListener('search', () => {
          clearTimeout(searchDebounce);
          runSearch();
        });
      }

      function syncBlockToUI(block) {
        const level = levelMap.get(block.levelId);
        if (!level) {
          details.textContent = 'This block is not linked to a floor in the map data.';
          return false;
        }
        const buildingName = level.building || 'Main Campus';
        buildingSelect.innerHTML = `<option value="${escapeHtml(buildingName)}">${escapeHtml(buildingName)}</option>`;
        levelSelect.innerHTML = (campusData.levels || []).map((l) =>
          `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`
        ).join('');
        levelSelect.value = block.levelId;
        renderRoomList(level);
        details.innerHTML = `Block <strong>${escapeHtml(block.label || block.id)}</strong> — pick a room from the list or the plan.`;
        return true;
      }

      function onBlockClick(block) {
        if (!syncBlockToUI(block)) return;
        navigateToLevelRoomUI();
      }

      function readUrlBlock() {
        return new URLSearchParams(window.location.search).get('block') || null;
      }

      function applyBlockFromUrl() {
        const bid = readUrlBlock();
        if (!bid || !blockMap) return;
        const b = (blockMap.blocks || []).find((x) => (x.id || x.label) === bid);
        if (!b) return;
        const ok = syncBlockToUI(b);
        if (ok) {
          details.innerHTML = `Block <strong>${escapeHtml(b.label || b.id)}</strong> (from link) — select a room.`;
        }
        highlightHotspot(b.id || b.label);
        if (!ok) return;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => navigateToLevelRoomUI());
        });
      }

      const [_bm, _cd, _csi] = await Promise.all([
        loadJson('data/block_map.json'),
        loadJson('data/campus_mapped_improved.json'),
        loadJson('data/course_search_index.json'),
      ]);
      blockMap = _bm;
      campusData = _cd;
      if (_csi && typeof _csi === 'object' && !Array.isArray(_csi)) {
        courseSearchIndex = _csi;
      }

      if (!blockMap || !campusData) {
        if (details) {
          const fileHint = window.location.protocol === 'file:' ? ' Open http://localhost:3000/ instead.' : '';
          details.textContent = 'Could not load map data.' + fileHint;
        }
        return;
      }

      levelMap = new Map((campusData.levels || []).map((l) => [l.id, l]));
      overlay.style.pointerEvents = 'auto';

      await waitForCampusImageReady();
      layoutOverlayToImage();
      if (typeof ResizeObserver !== 'undefined' && img) {
        new ResizeObserver(() => layoutOverlayToImage()).observe(img);
      }
      window.addEventListener('resize', layoutOverlayToImage);
      img.addEventListener('load', layoutOverlayToImage);

      (blockMap.blocks || []).forEach((b) => {
        const id = b.id || b.label;
        const btn = createHotspot(b.label || id, b.left_pct, b.top_pct, id);
        btn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const newUrl = window.location.pathname + '?block=' + encodeURIComponent(id);
          window.history.pushState({ block: id }, '', newUrl);
          onBlockClick(b);
          highlightHotspot(id);
        });
        overlay.appendChild(btn);
      });

      // initial render of hotspots was done above by the simple insertion loop.
      // Keep renderBlockHotspots as a no-op to avoid interfering with initial UI.

      levelSelect.addEventListener('change', () => {
        const lvl = levelMap.get(levelSelect.value);
        if (lvl) renderRoomList(lvl);
      });

      window.addEventListener('popstate', () => { applyBlockFromUrl(); });

      // Listen for editor saves via BroadcastChannel and localStorage fallback.
      // On notification we reload the page so the main UI refreshes (safe and simple).
      try {
        const bc = new BroadcastChannel('block-map');
        bc.addEventListener('message', () => {
          try { window.location.reload(); } catch (e) { /* ignore */ }
        });
      } catch (e) {
        // ignore if not supported
      }
      window.addEventListener('storage', (ev) => {
        if (!ev || ev.key !== 'block_map_updated') return;
        try { window.location.reload(); } catch (e) { /* ignore */ }
      });

      applyBlockFromUrl();
      if (!readUrlBlock() && campusData.levels && campusData.levels[0]) {
        renderRoomList(campusData.levels[0]);
        levelSelect.innerHTML = (campusData.levels || []).map((l) =>
          `<option value="${escapeHtml(l.id)}">${escapeHtml(l.name)}</option>`
        ).join('');
        buildingSelect.innerHTML = `<option>${escapeHtml(campusData.levels[0].building || 'Main Campus')}</option>`;
        levelSelect.value = campusData.levels[0].id;
      }
    } catch (err) {
      console.error('index_main initialization error:', err);
      try {
        const detailsEl = document.getElementById('details');
        if (detailsEl) detailsEl.textContent = 'Error initializing page: ' + (err && err.message ? err.message : String(err));
      } catch (e) {}
      throw err;
    }
  });
})();
