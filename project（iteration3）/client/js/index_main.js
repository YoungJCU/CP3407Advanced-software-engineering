/**
 * Campus map + English UI + search (API with local fallback).
 */
(function () {
  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const campusBlockLayer = document.getElementById('campusBlockLayer');
      const campusRoadsLayer = document.getElementById('campusRoadsLayer');
      const campusRouteLayer = document.getElementById('campusRouteLayer');
      const campusGateLayer = document.getElementById('campusGateLayer');
      const campusOverviewSvg = document.getElementById('campusOverviewSvg');
      const campusRaster = document.getElementById('campusRaster');
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
      /** 与 server/demo 同步的本地示例课表（API 不可用时仍可展示） */
      let localTimetable = null;
      /** 当前选中的 block，用于重绘 SVG 后恢复高亮与 Gate 路线 */
      let selectedBlockId = null;

      function escapeHtml(s) {
        return String(s || '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');
      }

      const DEFAULT_OVERVIEW_INTRO =
        'Select a block — orange dashed path from Gate (waypoints in Map editor). Blue lines are reference roads. Labels are compact so buildings stay visible. Then pick a room.';

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

      async function refreshLoginStatus() {
        const user = localStorage.getItem('nav_user');
        if (user) {
          let displayName = localStorage.getItem('nav_user_name') || '';
          let role = localStorage.getItem('nav_user_role') || '';
          if (window.getUserProfile) {
            try {
              const profile = await window.getUserProfile(user);
              displayName = profile.displayName || displayName;
              role = profile.role || role;
              try {
                localStorage.setItem('nav_user_name', displayName || '');
                localStorage.setItem('nav_user_role', role || '');
              } catch (e) { /* ignore */ }
            } catch (e) {
              // keep cached profile data if backend not available
            }
          }
          const who = displayName || user;
          const roleTxt = role ? ` <span style="color:#64748b">(${escapeHtml(role)})</span>` : '';
          loginStatus.innerHTML =
            `Signed in as <strong>${escapeHtml(who)}</strong>${roleTxt} · <a href="login.html">Change</a> · ` +
            `<button type="button" id="logoutBtn" class="btn" style="padding:4px 10px;font-size:13px;margin-left:4px">Sign out</button>`;
          const lb = document.getElementById('logoutBtn');
          if (lb) {
            lb.addEventListener('click', () => {
              try {
                localStorage.removeItem('nav_user');
                localStorage.removeItem('nav_user_pass');
                localStorage.removeItem('nav_user_name');
                localStorage.removeItem('nav_user_role');
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
          '<strong>本地用「文件」打开时</strong>，浏览器会阻止读取地图数据。请先在 <code>project/server</code> 运行 <code>npm start</code>（本仓库默认端口 <strong>3001</strong>），再用 <strong>http://localhost:3001/</strong> 访问。<br>' +
          '<span style="font-size:13px">Why: security rules for <code>fetch()</code> from disk, not a project bug.</span>';
        mainEl.insertBefore(w, mainEl.firstChild);
      }

      if (campusRaster) {
        campusRaster.addEventListener('error', () => {
          if (campusOverviewSvg) {
            campusOverviewSvg.setAttribute('role', 'img');
            campusOverviewSvg.setAttribute('aria-label', 'Campus map image failed to load');
          }
        });
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

      /** 与底图像素一致，保证 left_pct/top_pct 与 PNG 对齐；失败时用占位比例 */
      function syncCampusOverviewViewBox() {
        if (!campusOverviewSvg || !campusRaster) return { w: 1000, h: 600 };
        let w = campusRaster.naturalWidth || 0;
        let h = campusRaster.naturalHeight || 0;
        if (!w || !h) {
          w = 1000;
          h = 600;
        }
        campusOverviewSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
        campusRaster.setAttribute('width', String(w));
        campusRaster.setAttribute('height', String(h));
        campusRaster.setAttribute('x', '0');
        campusRaster.setAttribute('y', '0');
        return { w, h };
      }

      async function waitForCampusRasterReady() {
        if (!campusRaster) return;
        if (campusRaster.decode && typeof campusRaster.decode === 'function') {
          try {
            await campusRaster.decode();
          } catch (e) { /* ignore */ }
        } else if (!campusRaster.complete) {
          await new Promise((resolve) => {
            campusRaster.addEventListener('load', resolve, { once: true });
            campusRaster.addEventListener('error', resolve, { once: true });
          });
        }
        await new Promise((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(resolve));
        });
      }

      function updateGateRouteGeometry() {
        if (!campusRouteLayer || !blockMap) return;
        while (campusRouteLayer.firstChild) campusRouteLayer.removeChild(campusRouteLayer.firstChild);
        if (!selectedBlockId) return;
        const gate = blockMap.gate || { left_pct: 50, top_pct: 88, label: 'Gate' };
        const block = (blockMap.blocks || []).find((x) => String(x.id || x.label) === String(selectedBlockId));
        if (!block) return;
        const { w, h } = syncCampusOverviewViewBox();
        const gx = (gate.left_pct / 100) * w;
        const gy = (gate.top_pct / 100) * h;
        const tx = (block.left_pct / 100) * w;
        const ty = (block.top_pct / 100) * h;
        const ns = 'http://www.w3.org/2000/svg';
        const waypoints = Array.isArray(block.nav_path_pct) ? block.nav_path_pct : [];
        const pts = [{ x: gx, y: gy }];
        waypoints.forEach((p) => {
          if (p && Number.isFinite(Number(p.left_pct)) && Number.isFinite(Number(p.top_pct))) {
            pts.push({ x: (Number(p.left_pct) / 100) * w, y: (Number(p.top_pct) / 100) * h });
          }
        });
        pts.push({ x: tx, y: ty });
        for (let i = 0; i < pts.length - 1; i++) {
          const line = document.createElementNS(ns, 'line');
          line.setAttribute('class', 'campus-route-line');
          line.setAttribute('x1', String(pts[i].x));
          line.setAttribute('y1', String(pts[i].y));
          line.setAttribute('x2', String(pts[i + 1].x));
          line.setAttribute('y2', String(pts[i + 1].y));
          if (i === pts.length - 2) line.setAttribute('marker-end', 'url(#campusRouteArrow)');
          campusRouteLayer.appendChild(line);
        }
      }

      function roadDrawSegments(road) {
        if (!road || typeof road !== 'object') return [];
        if (Array.isArray(road.polylines) && road.polylines.length) {
          return road.polylines.filter((seg) => Array.isArray(seg) && seg.length >= 2);
        }
        const legacy = road.points_pct || [];
        return legacy.length >= 2 ? [legacy] : [];
      }

      function renderRoadsOverlay(w, h) {
        if (!campusRoadsLayer || !blockMap) return;
        while (campusRoadsLayer.firstChild) campusRoadsLayer.removeChild(campusRoadsLayer.firstChild);
        const roads = blockMap.roads || [];
        const ns = 'http://www.w3.org/2000/svg';
        roads.forEach((road) => {
          roadDrawSegments(road).forEach((pts) => {
            const pointsStr = pts
              .filter((p) => p && Number.isFinite(Number(p.left_pct)) && Number.isFinite(Number(p.top_pct)))
              .map((p) => `${(Number(p.left_pct) / 100) * w},${(Number(p.top_pct) / 100) * h}`)
              .join(' ');
            if (!pointsStr) return;
            const pl = document.createElementNS(ns, 'polyline');
            pl.setAttribute('points', pointsStr);
            pl.setAttribute('class', 'campus-road-line');
            campusRoadsLayer.appendChild(pl);
          });
        });
      }

      function clampMarker(v, lo, hi, def) {
        const n = Number(v);
        if (!Number.isFinite(n)) return def;
        return Math.min(hi, Math.max(lo, n));
      }

      function mergeMarkerStyle(base, partial) {
        const p = partial && typeof partial === 'object' ? partial : {};
        const shapes = new Set(['pill', 'rect', 'circle']);
        const pickShape = (s) => (shapes.has(String(s)) ? String(s) : 'pill');
        const shape = p.shape != null && String(p.shape) !== '' ? pickShape(p.shape) : pickShape(base.shape);
        return {
          sizeScale: clampMarker(p.sizeScale != null ? p.sizeScale : base.sizeScale, 0.35, 2.5, 1),
          fillOpacity: clampMarker(p.fillOpacity != null ? p.fillOpacity : base.fillOpacity, 0.12, 1, 0.82),
          labelOpacity: clampMarker(p.labelOpacity != null ? p.labelOpacity : base.labelOpacity, 0.15, 1, 1),
          shape,
        };
      }

      function mapUiRoot() {
        return blockMap && blockMap.mapUi && typeof blockMap.mapUi === 'object' ? blockMap.mapUi : {};
      }

      function effectiveGateStyle() {
        const base = { sizeScale: 1, fillOpacity: 0.82, labelOpacity: 1, shape: 'pill' };
        const gate = blockMap && blockMap.gate ? blockMap.gate : {};
        return mergeMarkerStyle(base, gate.style || {});
      }

      function effectiveBlockStyle(block) {
        const defs = mergeMarkerStyle(
          { sizeScale: 1, fillOpacity: 0.82, labelOpacity: 1, shape: 'pill' },
          mapUiRoot().blockDefaults || {}
        );
        return mergeMarkerStyle(defs, block.style || {});
      }

      function computeMarkerDims(label, w, h, kind, sizeScale) {
        const charW = w * 0.0135;
        const padX = Math.max(w * 0.008, 6);
        const rh0 = Math.max(h * 0.038, Math.min(w, h) * 0.032);
        const rwMax = kind === 'gate' ? w * 0.26 : w * 0.28;
        const rwMin = kind === 'gate' ? w * 0.072 : w * 0.078;
        const rw0 = Math.min(rwMax, Math.max(rwMin, String(label).length * charW + padX * 2));
        const sc = clampMarker(sizeScale, 0.35, 2.5, 1);
        return { rw: rw0 * sc, rh: rh0 * sc };
      }

      /** @param {boolean} includeHit dashed ring for hover (blocks only) */
      function makeStyledMarkerShapes(ns, shapeType, cx, cy, rw, rh, shapeClass, hitClass, includeHit) {
        const x = cx - rw / 2;
        const y = cy - rh / 2;
        const pad = Math.max(4, Math.min(rw, rh) * 0.07);
        let shape;
        let hit = null;
        if (shapeType === 'circle') {
          const r = Math.max(rw, rh) / 2;
          shape = document.createElementNS(ns, 'circle');
          shape.setAttribute('class', shapeClass);
          shape.setAttribute('cx', String(cx));
          shape.setAttribute('cy', String(cy));
          shape.setAttribute('r', String(r));
          if (includeHit) {
            hit = document.createElementNS(ns, 'circle');
            hit.setAttribute('class', hitClass);
            hit.setAttribute('cx', String(cx));
            hit.setAttribute('cy', String(cy));
            hit.setAttribute('r', String(r + pad));
          }
        } else {
          const rx = shapeType === 'rect' ? Math.min(14, rh * 0.2) : rh / 2;
          shape = document.createElementNS(ns, 'rect');
          shape.setAttribute('class', shapeClass);
          shape.setAttribute('x', String(x));
          shape.setAttribute('y', String(y));
          shape.setAttribute('width', String(rw));
          shape.setAttribute('height', String(rh));
          shape.setAttribute('rx', String(rx));
          if (includeHit) {
            const nh = rh + 2 * pad;
            const nrx = shapeType === 'rect' ? Math.min(18, nh * 0.22) : nh / 2;
            hit = document.createElementNS(ns, 'rect');
            hit.setAttribute('class', hitClass);
            hit.setAttribute('x', String(x - pad));
            hit.setAttribute('y', String(y - pad));
            hit.setAttribute('width', String(rw + 2 * pad));
            hit.setAttribute('height', String(nh));
            hit.setAttribute('rx', String(nrx));
          }
        }
        return { shape, hit };
      }

      function renderOverviewIntro() {
        const el = document.getElementById('campusOverviewIntro');
        if (!el) return;
        const raw =
          blockMap && blockMap.mapUi && typeof blockMap.mapUi.overviewIntro === 'string'
            ? blockMap.mapUi.overviewIntro
            : DEFAULT_OVERVIEW_INTRO;
        el.innerHTML = escapeHtml(raw).replace(/\n/g, '<br>');
      }

      function renderGateMarker(w, h) {
        if (!campusGateLayer || !blockMap) return;
        const gate = blockMap.gate || { left_pct: 50, top_pct: 88, label: 'Gate' };
        const ns = 'http://www.w3.org/2000/svg';
        const label = gate.label || 'Gate';
        const st = effectiveGateStyle();
        const cx = (gate.left_pct / 100) * w;
        const cy = (gate.top_pct / 100) * h;
        // prefer explicit percentages if provided
        const defaultDims = computeMarkerDims(label, w, h, 'gate', st.sizeScale);
        const rw = Number(gate.w_pct) ? (Number(gate.w_pct) / 100) * w : defaultDims.rw;
        const rh = Number(gate.h_pct) ? (Number(gate.h_pct) / 100) * h : defaultDims.rh;
        const rot = Number(gate.rot_deg) || 0;
        const g = document.createElementNS(ns, 'g');
        g.setAttribute('class', 'campus-gate-marker');
        g.setAttribute('role', 'img');
        g.setAttribute('aria-label', `${label}, main entrance reference point`);
        const { shape } = makeStyledMarkerShapes(ns, st.shape, cx, cy, rw, rh, 'campus-gate-shape', '', false);
        shape.setAttribute('fill-opacity', String(st.fillOpacity));
        // rotate the whole group around its center; keep label upright by counter-rotating the text
        g.setAttribute('transform', `rotate(${rot},${cx},${cy})`);
        const fontSize = Math.max(Math.min(w, h) * 0.0175, 9);
        const text = document.createElementNS(ns, 'text');
        text.setAttribute('class', 'campus-gate-label');
        text.setAttribute('x', String(cx));
        text.setAttribute('y', String(cy + fontSize * 0.35));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('dominant-baseline', 'middle');
        text.setAttribute('font-size', String(fontSize));
        text.setAttribute('opacity', String(st.labelOpacity));
        text.textContent = label;
        // counter-rotate text so it's readable
        if (rot) text.setAttribute('transform', `rotate(${-rot},${cx},${cy})`);
        g.appendChild(shape);
        g.appendChild(text);
        campusGateLayer.appendChild(g);
      }

      function highlightHotspot(id) {
        selectedBlockId = id != null && id !== '' ? String(id) : null;
        if (!campusBlockLayer) return;
        campusBlockLayer.querySelectorAll('.campus-block-hotspot').forEach((el) => {
          el.classList.toggle('selected', el.getAttribute('data-block-id') === String(id));
        });
        updateGateRouteGeometry();
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

      function attachBlockHotspotHandlers(g, onActivate) {
        const activate = (ev) => {
          if (ev.type === 'keydown' && ev.key !== 'Enter' && ev.key !== ' ') return;
          if (ev.type === 'keydown') ev.preventDefault();
          onActivate();
        };
        g.addEventListener('click', (ev) => {
          ev.stopPropagation();
          activate(ev);
        });
        g.addEventListener('keydown', activate);
      }

      /** 在校园 SVG 坐标系内绘制可点击楼块（样式来自 mapUi / block.style） */
      function createSvgBlockHotspot(block, w, h) {
        const ns = 'http://www.w3.org/2000/svg';
        const id = block.id || block.label;
        const label = block.label || id;
        const st = effectiveBlockStyle(block);
        const cx = (block.left_pct / 100) * w;
        const cy = (block.top_pct / 100) * h;
        // prefer explicit percentages if present
        const defaultDims = computeMarkerDims(label, w, h, 'block', st.sizeScale);
        const rw = Number(block.w_pct) ? (Number(block.w_pct) / 100) * w : defaultDims.rw;
        const rh = Number(block.h_pct) ? (Number(block.h_pct) / 100) * h : defaultDims.rh;
        const rot = Number(block.rot_deg) || 0;
         const g = document.createElementNS(ns, 'g');
         g.setAttribute('class', 'campus-block-hotspot');
         g.setAttribute('data-block-id', id);
         g.setAttribute('role', 'button');
         g.setAttribute('tabindex', '0');
         g.setAttribute('aria-label', `${label}, select floor and rooms`);
         const titleEl = document.createElementNS(ns, 'title');
         titleEl.textContent = `${label} — click to choose rooms`;
         g.appendChild(titleEl);
        const { shape, hit } = makeStyledMarkerShapes(ns, st.shape, cx, cy, rw, rh, 'campus-block-shape', 'campus-block-hit', true);
        shape.setAttribute('stroke-width', String(Math.max(1, Math.min(w, h) * 0.001)));
        shape.setAttribute('fill-opacity', String(st.fillOpacity));
        // apply rotation to the whole group; keep label upright via counter-rotation
        if (rot) g.setAttribute('transform', `rotate(${rot},${cx},${cy})`);
        g.appendChild(shape);
        if (hit) g.appendChild(hit);
         const fontSize = Math.max(Math.min(w, h) * 0.0175, 9);
         const text = document.createElementNS(ns, 'text');
         text.setAttribute('class', 'campus-block-label');
         text.setAttribute('x', String(cx));
         text.setAttribute('y', String(cy + fontSize * 0.35));
         text.setAttribute('text-anchor', 'middle');
         text.setAttribute('dominant-baseline', 'middle');
         text.setAttribute('font-size', String(fontSize));
         text.setAttribute('font-weight', '600');
         text.setAttribute('opacity', String(st.labelOpacity));
         text.textContent = label;
        if (rot) text.setAttribute('transform', `rotate(${-rot},${cx},${cy})`);
         g.appendChild(text);
         return g;
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

      /** 与 SQLite seed 一致的示例座位数（仅用于离线/兜底展示） */
      function pseudoSeatsForRoomId(roomId) {
        const cap = 40 + (Number(roomId) % 7) * 12;
        const avail = Math.max(0, cap - 10 - (Number(roomId) % 5) * 3);
        return { totalSeats: cap, availableSeats: avail };
      }

      function buildRoomIntro(room, level) {
        const n = room.name || 'This space';
        const floorName = level && level.name ? level.name : 'this level';
        const blurb = level && level.description ? ` ${level.description}` : '';
        if (/^Classroom\s+L/i.test(n)) {
          return `${n} is a general teaching room on ${floorName}, with AV and writable surfaces for lectures and tutorials.${blurb} The timetable below uses sample Trimester 1 sessions for demonstration.`;
        }
        if (/Computer Lab/i.test(n)) {
          return `${n} is an ICT lab with PCs for programming and practical work.${blurb}`;
        }
        if (/Auditorium/i.test(n)) {
          return `${n} provides large-capacity tiered seating for cohort lectures, orientation, and events.${blurb}`;
        }
        if (/Library/i.test(n)) {
          return `${n} supports study and access to learning resources.${blurb}`;
        }
        if (/Cafeteria/i.test(n)) {
          return `${n} is the main dining and informal meeting hub; hours below are indicative.${blurb}`;
        }
        if (/Reception|Administration/i.test(n)) {
          return `${n} is a front-of-house or admin area for enquiries and services.${blurb}`;
        }
        if (/Discussion|Collaboration/i.test(n)) {
          return `${n} is a bookable collaboration space for group work and presentations.${blurb}`;
        }
        if (/Student Hub/i.test(n)) {
          return `${n} is a student commons for informal learning and activities.${blurb}`;
        }
        if (/Lecture Room/i.test(n)) {
          return `${n} is a mid-size room for lectures and seminars.${blurb}`;
        }
        if (/Study Room/i.test(n)) {
          return `${n} is for self-directed study; bookings may apply during busy periods.${blurb}`;
        }
        if (/Bioscience|Science Teaching|Psychology|AquaHealth/i.test(n) || (/Lab/i.test(n) && !/Computer/i.test(n))) {
          return `${n} is a specialist lab for supervised practical sessions and experiments.${blurb}`;
        }
        if (/Financial Lab/i.test(n)) {
          return `${n} supports finance and analytics practicals with dedicated software and data tools.${blurb}`;
        }
        if (/Research Lab/i.test(n)) {
          return `${n} supports honours and project research under supervision.${blurb}`;
        }
        if (/Staff Office/i.test(n)) {
          return `${n} is primarily staff workspace; any timetable below is illustrative only.${blurb}`;
        }
        if (/Meeting Room/i.test(n)) {
          return `${n} hosts meetings, committees, and presentation-style sessions.${blurb}`;
        }
        return `${n} is on ${floorName}.${blurb}`;
      }

      function showLocalDetails(room, level) {
        const seats = pseudoSeatsForRoomId(room.id);
        const idStr = String(room.id);
        let courses = [];
        if (localTimetable && localTimetable.coursesByClassroom && localTimetable.coursesByClassroom[idStr]) {
          courses = localTimetable.coursesByClassroom[idStr].map((c) => ({ ...c }));
        }
        const trim = (localTimetable && localTimetable.trimester) || 'Trimester 1, 2026';
        renderBackendDetails({
          name: room.name,
          building: level.building || 'JCU Singapore — Main Campus',
          floor: levelIdToFloor(level.id),
          totalSeats: seats.totalSeats,
          availableSeats: seats.availableSeats,
          courses,
          intro: buildRoomIntro(room, level),
          trimester: trim,
        });
      }

      function renderBackendDetails(data) {
        const courses = Array.isArray(data.courses) ? data.courses : [];
        const trimester =
          (data.trimester && String(data.trimester)) ||
          (courses[0] && courses[0].trimester ? String(courses[0].trimester) : '');
        const introHtml = data.intro
          ? `<p style="margin-top:10px;font-size:14px;color:#334155;line-height:1.55;max-width:52em">${escapeHtml(data.intro)}</p>`
          : '';
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
          : '<p style="margin-top:8px;color:#64748b;font-size:13px;line-height:1.5">No sample class sessions are listed for this space in the bundled data. Use the description above for how this room is normally used.</p>';

        details.innerHTML =
          `<div style="font-weight:700">${escapeHtml(data.name || 'Room')}</div>` +
          `<div style="color:#6b7280;margin-top:6px">${escapeHtml(data.building || '')} · Floor ${escapeHtml(String(data.floor != null ? data.floor : ''))}</div>` +
          `<div style="margin-top:6px">Seats: ${escapeHtml(String(data.availableSeats != null ? data.availableSeats : '?'))} free / ${escapeHtml(String(data.totalSeats != null ? data.totalSeats : '?'))} total</div>` +
          introHtml +
          (trimester ? `<div style="margin-top:8px;font-size:13px;color:#334155">Term: <strong>${escapeHtml(trimester)}</strong></div>` : '') +
          `<div style="margin-top:10px;font-weight:600">Timetable</div>` +
          courseHtml;
      }

      async function showRoomDetails(room, level) {
        roomList.querySelectorAll('.room-item').forEach((el) => {
          el.classList.toggle('selected-room', el.textContent === room.name);
        });
        if (window.getClassroomById && room.id != null) {
          try {
            const data = await window.getClassroomById(room.id);
            const merged = { ...data, intro: data.intro || buildRoomIntro(room, level) };
            const apiCourses = Array.isArray(merged.courses) ? merged.courses : [];
            if (!merged.trimester && apiCourses[0] && apiCourses[0].trimester) {
              merged.trimester = apiCourses[0].trimester;
            }
            renderBackendDetails(merged);
            return;
          } catch (e) {
            /* fall through to local */
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

      const [_bm, _cd, _csi, _lt] = await Promise.all([
        loadJson('data/block_map.json'),
        loadJson('data/campus_mapped_improved.json'),
        loadJson('data/course_search_index.json'),
        loadJson('data/room_local_timetable.json'),
      ]);
      blockMap = _bm;
      renderOverviewIntro();
      campusData = _cd;
      if (_csi && typeof _csi === 'object' && !Array.isArray(_csi)) {
        courseSearchIndex = _csi;
      }
      if (_lt && typeof _lt === 'object' && _lt.coursesByClassroom) {
        localTimetable = _lt;
      }

      if (!blockMap || !campusData) {
        if (details) {
          const fileHint = window.location.protocol === 'file:' ? ' Open http://localhost:3001/ instead.' : '';
          details.textContent = 'Could not load map data.' + fileHint;
        }
        return;
      }

      levelMap = new Map((campusData.levels || []).map((l) => [l.id, l]));

      await waitForCampusRasterReady();

      function renderCampusOverviewMap() {
        if (!campusBlockLayer || !blockMap) return;
        const { w, h } = syncCampusOverviewViewBox();
        while (campusBlockLayer.firstChild) campusBlockLayer.removeChild(campusBlockLayer.firstChild);
        if (campusGateLayer) {
          while (campusGateLayer.firstChild) campusGateLayer.removeChild(campusGateLayer.firstChild);
        }
        if (campusRouteLayer) {
          while (campusRouteLayer.firstChild) campusRouteLayer.removeChild(campusRouteLayer.firstChild);
        }
        if (campusRoadsLayer) {
          while (campusRoadsLayer.firstChild) campusRoadsLayer.removeChild(campusRoadsLayer.firstChild);
        }
        renderRoadsOverlay(w, h);
        renderGateMarker(w, h);
        (blockMap.blocks || []).forEach((b) => {
          const id = b.id || b.label;
          const g = createSvgBlockHotspot(b, w, h);
          attachBlockHotspotHandlers(g, () => {
            const newUrl = window.location.pathname + '?block=' + encodeURIComponent(id);
            window.history.pushState({ block: id }, '', newUrl);
            onBlockClick(b);
            highlightHotspot(id);
          });
          campusBlockLayer.appendChild(g);
        });
        if (selectedBlockId) {
          highlightHotspot(selectedBlockId);
        }
      }

      // Reload block map from disk/API and re-render overview (used when editor notifies changes)
      async function reloadBlockMap() {
        try {
          const fresh = await loadJson('data/block_map.json?t=' + Date.now());
          if (!fresh) return;
          blockMap = fresh;
          renderOverviewIntro();
          renderCampusOverviewMap();
        } catch (e) {
          console.warn('reloadBlockMap failed', e);
        }
      }

      // Listen for editor notifications (BroadcastChannel preferred, fallback to storage events)
      try {
        const bc = new BroadcastChannel('block-map');
        bc.addEventListener('message', (ev) => {
          reloadBlockMap();
        });
      } catch (e) {
        window.addEventListener('storage', (ev) => {
          if (ev.key === 'block_map_updated') reloadBlockMap();
        });
      }

      renderCampusOverviewMap();

      if (campusRaster) {
        campusRaster.addEventListener('load', () => {
          renderCampusOverviewMap();
        });
      }

      levelSelect.addEventListener('change', () => {
        const lvl = levelMap.get(levelSelect.value);
        if (lvl) renderRoomList(lvl);
      });

      window.addEventListener('popstate', () => { applyBlockFromUrl(); });

      window.addEventListener('backend:up', () => {
        if (searchHint) {
          searchHint.textContent = 'Rooms, floors, module codes, titles, session types, days, times, and term. Select a result to open details.';
        }
      });
      window.addEventListener('backend:down', () => {
        if (searchHint) {
          searchHint.textContent = 'Rooms, floors, and module keywords (local index). Connect the server for live timetables.';
        }
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
      console.error('SVG index initialization error:', err);
      try {
        const detailsEl = document.getElementById('details');
        if (detailsEl) detailsEl.textContent = 'Error initializing overview page: ' + (err && err.message ? err.message : String(err));
      } catch (e) {}
      throw err;
    }
  });
})();
