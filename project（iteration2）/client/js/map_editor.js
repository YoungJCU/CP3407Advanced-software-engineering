/**
 * Visual editor for data/block_map.json.
 * Click coordinates use campus <image> getScreenCTM() so browser zoom / SVG scaling stay aligned.
 */
(function () {
  const API = '/api/block-map';

  const DEFAULT_OVERVIEW_INTRO =
    'Select a block — orange dashed path from Gate (waypoints in Map editor). Blue lines are reference roads. Labels are compact so buildings stay visible. Then pick a room.';

  function clampStyleNum(v, lo, hi, def) {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.min(hi, Math.max(lo, n));
  }

  function normalizeFullStyle(s) {
    const p = s && typeof s === 'object' ? s : {};
    const shapes = new Set(['pill', 'rect', 'circle']);
    const sh = shapes.has(String(p.shape)) ? String(p.shape) : 'pill';
    return {
      sizeScale: clampStyleNum(p.sizeScale, 0.35, 2.5, 1),
      fillOpacity: clampStyleNum(p.fillOpacity, 0.12, 1, 0.82),
      labelOpacity: clampStyleNum(p.labelOpacity, 0.15, 1, 1),
      shape: sh,
    };
  }

  /** Keep only keys present on disk (partial overrides for blocks). */
  function normalizeBlockStylePartial(raw) {
    if (!raw || typeof raw !== 'object') return undefined;
    const full = normalizeFullStyle(raw);
    const out = {};
    if (raw.sizeScale != null && Number.isFinite(Number(raw.sizeScale))) out.sizeScale = full.sizeScale;
    if (raw.fillOpacity != null && Number.isFinite(Number(raw.fillOpacity))) out.fillOpacity = full.fillOpacity;
    if (raw.labelOpacity != null && Number.isFinite(Number(raw.labelOpacity))) out.labelOpacity = full.labelOpacity;
    if (raw.shape != null && String(raw.shape) !== '') out.shape = full.shape;
    return Object.keys(out).length ? out : undefined;
  }

  let data = {
    mapUi: {
      overviewIntro: DEFAULT_OVERVIEW_INTRO,
      blockDefaults: normalizeFullStyle({}),
    },
    gate: { id: 'Gate', label: 'Gate', left_pct: 50, top_pct: 88, style: normalizeFullStyle({}) },
    roads: [],
    blocks: [],
  };
  let levelOptions = [];
  /** which polyline segment is being edited per road index */
  const roadEditSeg = new Map();

  /** @type {null|'gate'|{type:'block',i:number}|{type:'nav',i:number}|{type:'road',r:number,s:number}} */
  let pickMode = null;

  const editorSvg = document.getElementById('editorSvg');
  const editorRaster = document.getElementById('editorRaster');
  const editorHitRect = document.getElementById('editorHitRect');
  const editorPillLayer = document.getElementById('editorPillLayer');
  const editorHandlesLayer = document.getElementById('editorHandlesLayer');
  const editorRoadsLayer = document.getElementById('editorRoadsLayer');
  const editorRoutePreview = document.getElementById('editorRoutePreview');
  const editorDotsLayer = document.getElementById('editorDotsLayer');
  const pickStatus = document.getElementById('pickStatus');
  const blockList = document.getElementById('blockList');
  const roadList = document.getElementById('roadList');
  const saveLog = document.getElementById('saveLog');

  function log(msg) {
    saveLog.textContent = typeof msg === 'string' ? msg : JSON.stringify(msg, null, 2);
  }

  function syncViewBox() {
    let w = editorRaster.naturalWidth || 0;
    let h = editorRaster.naturalHeight || 0;
    if (!w || !h) {
      w = 1000;
      h = 600;
    }
    editorSvg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    editorRaster.setAttribute('width', String(w));
    editorRaster.setAttribute('height', String(h));
    if (editorHitRect) {
      editorHitRect.setAttribute('x', '0');
      editorHitRect.setAttribute('y', '0');
      editorHitRect.setAttribute('width', String(w));
      editorHitRect.setAttribute('height', String(h));
    }
    return { w, h };
  }

  /**
   * Map click (client pixels) → percentages on the campus image, using the raster's CTM
   * (handles preserveAspectRatio letterboxing + page zoom).
   */
  function clientToMapPct(ev) {
    const img = editorRaster;
    const svg = editorSvg;
    if (!img || !svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    let ctm;
    try {
      ctm = img.getScreenCTM();
    } catch (e) {
      return null;
    }
    if (!ctm) return null;
    let p;
    try {
      p = pt.matrixTransform(ctm.inverse());
    } catch (e) {
      return null;
    }
    const iw = img.width.baseVal ? img.width.baseVal.value : parseFloat(img.getAttribute('width') || '0', 10);
    const ih = img.height.baseVal ? img.height.baseVal.value : parseFloat(img.getAttribute('height') || '0', 10);
    if (!iw || !ih) return null;
    return {
      left_pct: Math.max(0, Math.min(100, (p.x / iw) * 100)),
      top_pct: Math.max(0, Math.min(100, (p.y / ih) * 100)),
    };
  }

  function normalizeData(raw) {
    const g = raw.gate || {};
    const mu = raw.mapUi || {};
    return {
      mapUi: {
        overviewIntro: typeof mu.overviewIntro === 'string' ? mu.overviewIntro : DEFAULT_OVERVIEW_INTRO,
        blockDefaults: normalizeFullStyle(mu.blockDefaults),
      },
      gate: {
        id: g.id || 'Gate',
        label: g.label || 'Gate',
        left_pct: Number(g.left_pct) || 50,
        top_pct: Number(g.top_pct) || 88,
        // optional explicit gate size
        w_pct: Number(g.w_pct) || undefined,
        h_pct: Number(g.h_pct) || undefined,
        style: normalizeFullStyle(g.style),
      },
      roads: Array.isArray(raw.roads) ? raw.roads.map(normalizeRoad) : [],
      blocks: Array.isArray(raw.blocks) ? raw.blocks.map(normalizeBlock) : [],
    };
  }

  function normalizeRoad(r) {
    if (!r || typeof r !== 'object') return { id: 'road', label: 'Road', polylines: [[]] };
    let polylines = [];
    if (Array.isArray(r.polylines) && r.polylines.length) {
      polylines = r.polylines.map((seg) => (Array.isArray(seg) ? seg.map(normalizePt) : []));
    } else if (Array.isArray(r.points_pct) && r.points_pct.length) {
      polylines = [r.points_pct.map(normalizePt)];
    } else {
      polylines = [[]];
    }
    return {
      id: String(r.id || 'road'),
      label: String(r.label || r.id || 'Road'),
      polylines,
    };
  }

  function normalizeBlock(b) {
    if (!b || typeof b !== 'object') {
      return { id: 'Block', label: 'Block', left_pct: 50, top_pct: 50, levelId: 'level-1', nav_path_pct: [] };
    }
    const st = normalizeBlockStylePartial(b.style);
    const base = {
      id: String(b.id || 'Block'),
      label: String(b.label || b.id || 'Block'),
      left_pct: Number(b.left_pct) || 0,
      top_pct: Number(b.top_pct) || 0,
      levelId: String(b.levelId || 'level-1'),
      nav_path_pct: Array.isArray(b.nav_path_pct) ? b.nav_path_pct.map(normalizePt) : [],
      // Optional explicit width/height expressed as percentage of the whole image (0-100)
      w_pct: Number(b.w_pct) || undefined,
      h_pct: Number(b.h_pct) || undefined,
      // Optional rotation in degrees (clockwise)
      rot_deg: Number(b.rot_deg) || undefined,
    };
    if (st) base.style = st;
    return base;
  }

  function normalizePt(p) {
    return {
      left_pct: Number(p && p.left_pct) || 0,
      top_pct: Number(p && p.top_pct) || 0,
    };
  }

  function dataForSave() {
    const blocks = (data.blocks || []).map((b) => {
      const o = {
        id: String(b.id),
        label: String(b.label),
        left_pct: Number(b.left_pct) || 0,
        top_pct: Number(b.top_pct) || 0,
        levelId: String(b.levelId),
        nav_path_pct: (b.nav_path_pct || []).map((p) => ({
          left_pct: Number(p.left_pct) || 0,
          top_pct: Number(p.top_pct) || 0,
        })),
        // preserve explicit size if present
        ...(b.w_pct != null && Number.isFinite(Number(b.w_pct)) ? { w_pct: Number(b.w_pct) } : {}),
        ...(b.h_pct != null && Number.isFinite(Number(b.h_pct)) ? { h_pct: Number(b.hPct) } : {}),
        ...(b.rot_deg != null && Number.isFinite(Number(b.rot_deg)) ? { rot_deg: Number(b.rot_deg) } : {}),
      };
      const st = normalizeBlockStylePartial(b.style);
      if (st) o.style = st;
      return o;
    });
    return {
      mapUi: {
        overviewIntro: String(data.mapUi.overviewIntro != null ? data.mapUi.overviewIntro : ''),
        blockDefaults: normalizeFullStyle(data.mapUi.blockDefaults),
      },
      gate: {
        id: String(data.gate.id || 'Gate'),
        label: String(data.gate.label || 'Gate'),
        left_pct: Number(data.gate.left_pct) || 0,
        top_pct: Number(data.gate.top_pct) || 0,
        ...(data.gate.w_pct != null && Number.isFinite(Number(data.gate.w_pct)) ? { w_pct: Number(data.gate.w_pct) } : {}),
        ...(data.gate.h_pct != null && Number.isFinite(Number(data.gate.h_pct)) ? { h_pct: Number(data.gate.h_pct) } : {}),
        ...(data.gate.rot_deg != null && Number.isFinite(Number(data.gate.rot_deg)) ? { rot_deg: Number(data.gate.rot_deg) } : {}),
        style: normalizeFullStyle(data.gate.style),
      },
      blocks,
      roads: (data.roads || []).map((r) => ({
        id: String(r.id),
        label: String(r.label),
        polylines: (r.polylines || [])
          .map((seg) => (seg || []).map((p) => ({ left_pct: Number(p.left_pct) || 0, top_pct: Number(p.top_pct) || 0 })))
          .filter((seg) => seg.length > 0),
      })),
    };
  }

  function pillDimsScaled(label, w, h, kind, sizeScale) {
    const charW = w * 0.0135;
    const padX = Math.max(w * 0.008, 6);
    const rh0 = Math.max(h * 0.038, Math.min(w, h) * 0.032);
    const rwMax = kind === 'gate' ? w * 0.26 : w * 0.28;
    const rwMin = kind === 'gate' ? w * 0.072 : w * 0.078;
    const rw0 = Math.min(rwMax, Math.max(rwMin, String(label).length * charW + padX * 2));
    const sc = clampStyleNum(sizeScale, 0.35, 2.5, 1);
    return { rw: rw0 * sc, rh: rh0 * sc };
  }

  function makeEditorShape(ns, shapeType, cx, cy, rw, rh, shapeClass) {
    const x = cx - rw / 2;
    const y = cy - rh / 2;
    if (shapeType === 'circle') {
      const r = Math.max(rw, rh) / 2;
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('class', shapeClass);
      c.setAttribute('cx', String(cx));
      c.setAttribute('cy', String(cy));
      c.setAttribute('r', String(r));
      return c;
    }
    const rx = shapeType === 'rect' ? Math.min(14, rh * 0.2) : rh / 2;
    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('class', shapeClass);
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(rw));
    rect.setAttribute('height', String(rh));
    rect.setAttribute('rx', String(rx));
    return rect;
  }

  function effectiveBlockStyleForEditor(b) {
    const defs = normalizeFullStyle(data.mapUi.blockDefaults);
    const partial = b.style && typeof b.style === 'object' ? b.style : {};
    return normalizeFullStyle({ ...defs, ...partial });
  }

  function appendStyledMarker(parent, label, cx, cy, w, h, variant, st, explicitDims) {
    const ns = 'http://www.w3.org/2000/svg';
    const kind = variant === 'gate' ? 'gate' : 'block';
    const styleFull = normalizeFullStyle(st);
    const dims = pillDimsScaled(label, w, h, kind, styleFull.sizeScale);
    const { rw: defaultRw, rh: defaultRh } = dims;
    const rw = explicitDims && explicitDims.rw ? explicitDims.rw : defaultRw;
    const rh = explicitDims && explicitDims.rh ? explicitDims.rh : defaultRh;
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', variant === 'gate' ? 'ed-pill-g' : 'ed-pill-b');
    // allow pointer dragging of gate/blocks in editor
    if (explicitDims && explicitDims.idx != null) g.setAttribute('data-i', String(explicitDims.idx));
    g.setAttribute('data-type', variant === 'gate' ? 'gate' : 'block');
    g.style.cursor = 'move';
    // apply rotation if provided
    const rot = explicitDims && Number.isFinite(Number(explicitDims.rot_deg)) ? Number(explicitDims.rot_deg) : null;
    if (rot != null) g.setAttribute('transform', `rotate(${rot},${cx},${cy})`);
    const shape = makeEditorShape(ns, styleFull.shape, cx, cy, rw, rh, 'ed-pill-shape');
    shape.setAttribute('fill-opacity', String(styleFull.fillOpacity));
    const fontSize = Math.max(Math.min(w, h) * 0.0175, 9);
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('class', 'ed-pill-text');
    text.setAttribute('x', String(cx));
    text.setAttribute('y', String(cy + fontSize * 0.35));
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('font-size', String(fontSize));
    text.setAttribute('opacity', String(styleFull.labelOpacity));
    text.textContent = label;
    g.appendChild(shape);
    g.appendChild(text);
    parent.appendChild(g);
    // enable dragging by pointer on the marker
    g.addEventListener('pointerdown', startDrag);
    // rotation handle (small circle above the shape)
    const rotHandleSize = Math.max(6, Math.min(12, Math.min(w, h) * 0.01));
    const rotHandle = document.createElementNS(ns, 'circle');
    const handleY = cy - rh / 2 - Math.max(12, rotHandleSize * 2);
    rotHandle.setAttribute('cx', String(cx));
    rotHandle.setAttribute('cy', String(handleY));
    rotHandle.setAttribute('r', String(rotHandleSize));
    rotHandle.setAttribute('fill', '#10b981');
    rotHandle.setAttribute('stroke', '#fff');
    rotHandle.setAttribute('stroke-width', '1');
    rotHandle.setAttribute('cursor', 'grab');
    if (explicitDims && explicitDims.idx != null) rotHandle.setAttribute('data-i', String(explicitDims.idx));
    rotHandle.setAttribute('data-type', variant === 'gate' ? 'gate' : 'block');
    rotHandle.addEventListener('pointerdown', startRotate);
    parent.appendChild(rotHandle);
  }

  function persistBlockStyleOverride(i, key, value) {
    const defs = normalizeFullStyle(data.mapUi.blockDefaults);
    const cur = data.blocks[i];
    const eff = normalizeFullStyle({ ...defs, ...(cur.style || {}), [key]: value });
    const next = {};
    if (eff.sizeScale !== defs.sizeScale) next.sizeScale = eff.sizeScale;
    if (eff.fillOpacity !== defs.fillOpacity) next.fillOpacity = eff.fillOpacity;
    if (eff.labelOpacity !== defs.labelOpacity) next.labelOpacity = eff.labelOpacity;
    if (eff.shape !== defs.shape) next.shape = eff.shape;
    cur.style = Object.keys(next).length ? next : undefined;
  }

  function syncOverviewStyleFromData() {
    const ta = document.getElementById('overviewIntro');
    if (ta) ta.value = data.mapUi.overviewIntro || '';
    const bd = normalizeFullStyle(data.mapUi.blockDefaults);
    const setNum = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.value = String(v);
    };
    setNum('blkDefSize', bd.sizeScale);
    setNum('blkDefFillOp', bd.fillOpacity);
    setNum('blkDefLblOp', bd.labelOpacity);
    const bs = document.getElementById('blkDefShape');
    if (bs) bs.value = bd.shape;
    const gs = normalizeFullStyle(data.gate.style);
    setNum('gateStSize', gs.sizeScale);
    setNum('gateStFillOp', gs.fillOpacity);
    setNum('gateStLblOp', gs.labelOpacity);
    const gsh = document.getElementById('gateStShape');
    if (gsh) gsh.value = gs.shape;
  }

  function bindOverviewStyles() {
    const ta = document.getElementById('overviewIntro');
    if (ta && !ta._boundMapUi) {
      ta._boundMapUi = true;
      ta.addEventListener('input', () => {
        data.mapUi.overviewIntro = ta.value;
      });
    }
    const onDef = () => {
      data.mapUi.blockDefaults = normalizeFullStyle({
        sizeScale: document.getElementById('blkDefSize') && document.getElementById('blkDefSize').value,
        fillOpacity: document.getElementById('blkDefFillOp') && document.getElementById('blkDefFillOp').value,
        labelOpacity: document.getElementById('blkDefLblOp') && document.getElementById('blkDefLblOp').value,
        shape: document.getElementById('blkDefShape') && document.getElementById('blkDefShape').value,
      });
      renderBlockForm();
      drawPreview();
    };
    ['blkDefSize', 'blkDefFillOp', 'blkDefLblOp'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el._boundSt) {
        el._boundSt = true;
        el.addEventListener('change', onDef);
      }
    });
    const bsh = document.getElementById('blkDefShape');
    if (bsh && !bsh._boundSt) {
      bsh._boundSt = true;
      bsh.addEventListener('change', onDef);
    }
    const onGateSt = () => {
      data.gate.style = normalizeFullStyle({
        sizeScale: document.getElementById('gateStSize') && document.getElementById('gateStSize').value,
        fillOpacity: document.getElementById('gateStFillOp') && document.getElementById('gateStFillOp').value,
        labelOpacity: document.getElementById('gateStLblOp') && document.getElementById('gateStLblOp').value,
        shape: document.getElementById('gateStShape') && document.getElementById('gateStShape').value,
      });
      drawPreview();
    };
    ['gateStSize', 'gateStFillOp', 'gateStLblOp'].forEach((id) => {
      const el = document.getElementById(id);
      if (el && !el._boundSt) {
        el._boundSt = true;
        el.addEventListener('change', onGateSt);
      }
    });
    const gsh = document.getElementById('gateStShape');
    if (gsh && !gsh._boundSt) {
      gsh._boundSt = true;
      gsh.addEventListener('change', onGateSt);
    }
    if (blockList && !blockList._blkStDelegate) {
      blockList._blkStDelegate = true;
      blockList.addEventListener('change', (ev) => {
        const t = ev.target;
        if (!t.classList || !t.classList.contains('blk-st-inp')) return;
        const i = Number(t.getAttribute('data-i'));
        const k = t.getAttribute('data-sk');
        if (!Number.isFinite(i) || !data.blocks[i] || !k) return;
        const v = k === 'shape' ? String(t.value) : Number(t.value);
        persistBlockStyleOverride(i, k, v);
        drawPreview();
      });
    }
  }

  function getRoadSeg(r, s) {
    if (!r.polylines[s]) r.polylines[s] = [];
    return r.polylines[s];
  }

  function updatePickStatus() {
    if (!pickMode) {
      pickStatus.textContent = '当前：未选择放置模式';
      pickStatus.className = 'me-status warn';
      // disable global hit rect when not in placement mode so handles receive pointer events
      if (editorHitRect) {
        editorHitRect.style.pointerEvents = 'none';
        editorHitRect.style.cursor = '';
      }
      return;
    }
    if (pickMode === 'gate') {
      pickStatus.textContent = '当前：点击地图 → 设置 Gate 位置（与主页同款椭圆标签）';
      pickStatus.className = 'me-status';
      if (editorHitRect) {
        editorHitRect.style.pointerEvents = 'all';
        editorHitRect.style.cursor = 'crosshair';
      }
      return;
    }
    if (pickMode.type === 'block') {
      pickStatus.textContent = `当前：点击地图 → 设置楼块「${data.blocks[pickMode.i].id}」中心`;
      pickStatus.className = 'me-status';
      if (editorHitRect) {
        editorHitRect.style.pointerEvents = 'all';
        editorHitRect.style.cursor = 'crosshair';
      }
      return;
    }
    if (pickMode.type === 'nav') {
      pickStatus.textContent = `当前：为「${data.blocks[pickMode.i].id}」添加导航路径点（Gate→点→…→楼块）`;
      pickStatus.className = 'me-status';
      if (editorHitRect) {
        editorHitRect.style.pointerEvents = 'all';
        editorHitRect.style.cursor = 'crosshair';
      }
      return;
    }
    if (pickMode.type === 'road') {
      pickStatus.textContent = `当前：向道路「${data.roads[pickMode.r].id}」第 ${pickMode.s + 1} 段添加顶点（多段=分叉；路口请点同一坐标衔接）`;
      pickStatus.className = 'me-status';
      if (editorHitRect) {
        editorHitRect.style.pointerEvents = 'all';
        editorHitRect.style.cursor = 'crosshair';
      }
    }
  }

  function gateInputs() {
    document.getElementById('gateLabel').value = data.gate.label;
    document.getElementById('gateLeft').value = String(round2(data.gate.left_pct));
    document.getElementById('gateTop').value = String(round2(data.gate.top_pct));
    document.getElementById('gatePos').value = `${round2(data.gate.left_pct)} , ${round2(data.gate.top_pct)}`;
    const gw = document.getElementById('gateW');
    const gh = document.getElementById('gateH');
    if (gw) gw.value = data.gate.w_pct != null ? String(round2(data.gate.w_pct)) : '';
    if (gh) gh.value = data.gate.h_pct != null ? String(round2(data.gate.h_pct)) : '';
    const gr = document.getElementById('gateRot');
    if (gr) gr.value = data.gate.rot_deg != null ? String(data.gate.rot_deg) : '';
  }

  function round2(x) {
    return Math.round(x * 100) / 100;
  }

  function blockShapeOptions(selected) {
    const opts = [
      ['pill', 'pill 胶囊'],
      ['rect', 'rect 方角'],
      ['circle', 'circle 圆'],
    ];
    return opts
      .map(([v, lab]) => `<option value="${v}" ${v === selected ? 'selected' : ''}>${escapeHtml(lab)}</option>`)
      .join('');
  }

  function blockStyleFieldsHtml(b, i) {
    const st = effectiveBlockStyleForEditor(b);
    return `<details style="margin-top:8px;border-top:1px solid #e2e8f0;padding-top:8px">
      <summary class="me-small" style="cursor:pointer;font-weight:600;user-select:none">样式（大小 / 透明度 / 形状）</summary>
      <p class="me-small">与「默认楼块样式」一致时，保存不会单独写此楼块的 style。可点「清除覆盖」恢复跟随默认。</p>
      <div class="me-row">
        <div><label>scale</label><input type="number" class="blk-st-inp" data-sk="sizeScale" data-i="${i}" step="0.05" min="0.35" max="2.5" value="${escapeAttr(String(st.sizeScale))}" /></div>
        <div><label>填充透明</label><input type="number" class="blk-st-inp" data-sk="fillOpacity" data-i="${i}" step="0.05" min="0.12" max="1" value="${escapeAttr(String(st.fillOpacity))}" /></div>
      </div>
      <div class="me-row">
        <div><label>文字透明</label><input type="number" class="blk-st-inp" data-sk="labelOpacity" data-i="${i}" step="0.05" min="0.15" max="1" value="${escapeAttr(String(st.labelOpacity))}" /></div>
        <div><label>shape</label><select class="blk-st-inp" data-sk="shape" data-i="${i}">${blockShapeOptions(st.shape)}</select></div>
      </div>
      <button type="button" class="me-btn" data-act="clear-blk-style" data-i="${i}" style="margin-top:6px">清除覆盖（用默认）</button>
    </details>`;
  }

  function renderBlockForm() {
    const levels = levelOptions.length
      ? levelOptions
      : [{ id: 'level-1', name: 'level-1' }];
    blockList.innerHTML = '';
    data.blocks.forEach((b, i) => {
      const card = document.createElement('div');
      card.className = 'me-block-card';
      const opts = levels
        .map((l) => `<option value="${escapeAttr(l.id)}" ${l.id === b.levelId ? 'selected' : ''}>${escapeHtml(l.name || l.id)}</option>`)
        .join('');
      card.innerHTML =
        `<h3><span class="me-tag">#${i + 1}</span> ${escapeHtml(b.id)}</h3>
        <div class="me-row">
          <div><label>id（唯一）</label><input type="text" data-k="id" data-i="${i}" class="blk-inp" value="${escapeAttr(b.id)}" /></div>
          <div><label>显示名 label</label><input type="text" data-k="label" data-i="${i}" class="blk-inp" value="${escapeAttr(b.label)}" /></div>
        </div>
        <div class="me-row">
          <div><label>left_pct</label><input type="number" data-k="left_pct" data-i="${i}" class="blk-inp" step="0.1" value="${round2(b.left_pct)}" /></div>
          <div><label>top_pct</label><input type="number" data-k="top_pct" data-i="${i}" class="blk-inp" step="0.1" value="${round2(b.top_pct)}" /></div>
        </div>
        <div class="me-row">
          <div><label>width (%)</label><input type="number" data-k="w_pct" data-i="${i}" class="blk-inp" step="0.1" min="0.1" max="100" value="${escapeAttr(String(b.w_pct != null ? b.w_pct : ''))}" /></div>
          <div><label>height (%)</label><input type="number" data-k="h_pct" data-i="${i}" class="blk-inp" step="0.1" min="0.1" max="100" value="${escapeAttr(String(b.h_pct != null ? b.h_pct : ''))}" /></div>
        </div>
        <div class="me-row">
          <div><label>rotation (deg)</label><input type="number" data-k="rot_deg" data-i="${i}" class="blk-inp" step="1" min="-360" max="360" value="${escapeAttr(String(b.rot_deg != null ? b.rot_deg : ''))}" /></div>
        </div>
        <div class="me-row" style="grid-template-columns:1fr">
          <div><label>绑定楼层 levelId</label><select data-k="levelId" data-i="${i}" class="blk-sel">${opts}</select></div>
        </div>
        ${blockStyleFieldsHtml(b, i)}
        <div class="me-small">导航中间点 nav_path_pct：</div>
        <ul style="margin:4px 0;padding-left:18px;font-size:12px;color:#475569">${navListHtml(b, i)}</ul>
        <div class="me-btns">
          <button type="button" class="me-btn" data-act="pick-block" data-i="${i}">放置楼块位置</button>
          <button type="button" class="me-btn primary" data-act="pick-nav" data-i="${i}">添加导航路径点</button>
          <button type="button" class="me-btn danger" data-act="del-block" data-i="${i}">删除此楼块</button>
        </div>`;
      blockList.appendChild(card);
    });

    blockList.querySelectorAll('.blk-inp').forEach((inp) => inp.addEventListener('change', onBlockInput));
    blockList.querySelectorAll('.blk-sel').forEach((sel) => sel.addEventListener('change', onBlockSelect));
    blockList.querySelectorAll('button[data-act]').forEach((btn) => btn.addEventListener('click', onBlockAction));
    blockList.querySelectorAll('button[data-rm-nav]').forEach((btn) => btn.addEventListener('click', onRemoveNav));
  }

  function navListHtml(b, bi) {
    const arr = b.nav_path_pct || [];
    if (!arr.length) return '<li>（无 — Gate 到楼块直线）</li>';
    return arr
      .map(
        (p, j) =>
          `<li>${round2(p.left_pct)}, ${round2(p.top_pct)} <button type="button" data-rm-nav="${bi}-${j}" style="font-size:11px;margin-left:6px">删除</button></li>`
      )
      .join('');
  }

  function onRemoveNav(ev) {
    const id = ev.target.getAttribute('data-rm-nav');
    if (!id) return;
    const [bi, ji] = id.split('-').map(Number);
    data.blocks[bi].nav_path_pct.splice(ji, 1);
    renderBlockForm();
    drawPreview();
  }

  function onBlockInput(ev) {
    const inp = ev.target;
    const i = Number(inp.getAttribute('data-i'));
    const k = inp.getAttribute('data-k');
    if (!data.blocks[i]) return;
    if (k === 'left_pct' || k === 'top_pct' || k === 'w_pct' || k === 'h_pct' || k === 'rot_deg') data.blocks[i][k] = Number(inp.value) || 0;
    else data.blocks[i][k] = inp.value;
    gateInputs();
    drawPreview();
  }

  function onBlockSelect(ev) {
    const sel = ev.target;
    const i = Number(sel.getAttribute('data-i'));
    if (data.blocks[i]) data.blocks[i].levelId = sel.value;
  }

  function onBlockAction(ev) {
    const act = ev.target.getAttribute('data-act');
    const i = Number(ev.target.getAttribute('data-i'));
    if (act === 'pick-block') {
      pickMode = { type: 'block', i };
      updatePickStatus();
    } else if (act === 'pick-nav') {
      pickMode = { type: 'nav', i };
      if (!Array.isArray(data.blocks[i].nav_path_pct)) data.blocks[i].nav_path_pct = [];
      updatePickStatus();
    } else if (act === 'clear-blk-style') {
      delete data.blocks[i].style;
      renderBlockForm();
      drawPreview();
    } else if (act === 'del-block') {
      data.blocks.splice(i, 1);
      pickMode = null;
      renderBlockForm();
      drawPreview();
      updatePickStatus();
    }
  }

  function renderRoadForm() {
    roadList.innerHTML = '';
    data.roads.forEach((r, ri) => {
      if (!roadEditSeg.has(ri)) roadEditSeg.set(ri, 0);
      const segs = r.polylines || [[]];
      const maxSeg = Math.max(0, segs.length - 1);
      if (roadEditSeg.get(ri) > maxSeg) roadEditSeg.set(ri, maxSeg);
      const segOpts = segs
        .map((_, si) => `<option value="${si}" ${si === roadEditSeg.get(ri) ? 'selected' : ''}>第 ${si + 1} 段 (${(segs[si] || []).length} 点)</option>`)
        .join('');

      const card = document.createElement('div');
      card.className = 'me-block-card';
      card.innerHTML =
        `<h3><span class="me-tag">道路</span> ${escapeHtml(r.id)}</h3>
        <p class="me-small">多段 = 分叉；路口与另一条路相连时，在新段起点输入与上一条路相同的坐标（或点图到同一点）。</p>
        <div class="me-row">
          <div><label>id</label><input type="text" data-rk="id" data-ri="${ri}" class="road-inp" value="${escapeAttr(r.id)}" /></div>
          <div><label>label</label><input type="text" data-rk="label" data-ri="${ri}" class="road-inp" value="${escapeAttr(r.label)}" /></div>
        </div>
        <div class="me-row" style="grid-template-columns:1fr">
          <div><label>当前编辑哪一段折线</label><select class="road-seg-sel" data-ri="${ri}">${segOpts}</select></div>
        </div>
        <div class="me-btns" style="margin-bottom:8px">
          <button type="button" class="me-btn primary" data-ract="pick-road" data-ri="${ri}">点击地图添加顶点</button>
          <button type="button" class="me-btn" data-ract="add-seg" data-ri="${ri}">＋ 新分段（分叉）</button>
          <button type="button" class="me-btn danger" data-ract="del-road" data-ri="${ri}">删除道路</button>
          <button type="button" class="me-btn" data-ract="clear-seg" data-ri="${ri}">清空当前段</button>
        </div>
        <div class="me-small">各段顶点：</div>
        ${roadSegListsHtml(r, ri)}`;
      roadList.appendChild(card);
    });

    roadList.querySelectorAll('.road-inp').forEach((inp) => inp.addEventListener('change', onRoadInput));
    roadList.querySelectorAll('.road-seg-sel').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const ri = Number(e.target.getAttribute('data-ri'));
        roadEditSeg.set(ri, Number(e.target.value));
        updatePickStatus();
      });
    });
    roadList.querySelectorAll('button[data-ract]').forEach((btn) => btn.addEventListener('click', onRoadBtn));
    roadList.querySelectorAll('button[data-rm-rpt]').forEach((btn) => btn.addEventListener('click', onRemoveRoadPt));
  }

  function roadSegListsHtml(r, ri) {
    const segs = r.polylines || [];
    return segs
      .map((seg, si) => {
        const pts = seg || [];
        const li =
          pts.length === 0
            ? '<li>（空）</li>'
            : pts
                .map(
                  (p, pi) =>
                    `<li>${round2(p.left_pct)}, ${round2(p.top_pct)} <button type="button" data-rm-rpt="${ri}-${si}-${pi}" style="font-size:11px">删</button></li>`
                )
                .join('');
        return `<div style="font-size:12px;margin-bottom:6px"><strong>段 ${si + 1}</strong><ul style="margin:4px 0;padding-left:18px">${li}</ul></div>`;
      })
      .join('');
  }

  function onRoadInput(ev) {
    const inp = ev.target;
    const ri = Number(inp.getAttribute('data-ri'));
    const k = inp.getAttribute('data-rk');
    if (!data.roads[ri]) return;
    data.roads[ri][k] = inp.value;
    drawPreview();
  }

  function onRoadBtn(ev) {
    const act = ev.target.getAttribute('data-ract');
    const ri = Number(ev.target.getAttribute('data-ri'));
    const r = data.roads[ri];
    if (!r) return;

    if (act === 'pick-road') {
      const s = roadEditSeg.get(ri) || 0;
      pickMode = { type: 'road', r: ri, s };
      getRoadSeg(r, s);
      updatePickStatus();
    } else if (act === 'add-seg') {
      if (!Array.isArray(r.polylines)) r.polylines = [[]];
      r.polylines.push([]);
      roadEditSeg.set(ri, r.polylines.length - 1);
      pickMode = { type: 'road', r: ri, s: r.polylines.length - 1 };
      renderRoadForm();
      drawPreview();
      updatePickStatus();
    } else if (act === 'del-road') {
      data.roads.splice(ri, 1);
      roadEditSeg.delete(ri);
      reindexRoadEditSeg(ri);
      pickMode = null;
      renderRoadForm();
      drawPreview();
      updatePickStatus();
    } else if (act === 'clear-seg') {
      const s = roadEditSeg.get(ri) || 0;
      getRoadSeg(r, s).length = 0;
      drawPreview();
      renderRoadForm();
    }
  }

  function reindexRoadEditSeg(removedRi) {
    const next = new Map();
    roadEditSeg.forEach((v, k) => {
      if (k < removedRi) next.set(k, v);
      else if (k > removedRi) next.set(k - 1, v);
    });
    roadEditSeg.clear();
    next.forEach((v, k) => roadEditSeg.set(k, v));
  }

  function onRemoveRoadPt(ev) {
    const id = ev.target.getAttribute('data-rm-rpt');
    if (!id) return;
    const [ri, si, pi] = id.split('-').map(Number);
    const seg = data.roads[ri].polylines[si];
    if (seg) seg.splice(pi, 1);
    renderRoadForm();
    drawPreview();
  }

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, '&#39;');
  }

  function drawPreview() {
    const { w, h } = syncViewBox();
    const ns = 'http://www.w3.org/2000/svg';

    while (editorRoadsLayer.firstChild) editorRoadsLayer.removeChild(editorRoadsLayer.firstChild);
    (data.roads || []).forEach((road) => {
      const segs = road.polylines || [];
      segs.forEach((pts) => {
        if (!pts || pts.length < 2) return;
        const pl = document.createElementNS(ns, 'polyline');
        pl.setAttribute(
          'points',
          pts.map((p) => `${(p.left_pct / 100) * w},${(p.top_pct / 100) * h}`).join(' ')
        );
        pl.setAttribute('fill', 'none');
        pl.setAttribute('stroke', '#1d4ed8');
        pl.setAttribute('stroke-width', '4.5');
        pl.setAttribute('opacity', '0.88');
        pl.setAttribute('stroke-linecap', 'round');
        pl.setAttribute('stroke-linejoin', 'round');
        editorRoadsLayer.appendChild(pl);
      });
    });

    while (editorRoutePreview.firstChild) editorRoutePreview.removeChild(editorRoutePreview.firstChild);
    const g = data.gate;
    const gx = (g.left_pct / 100) * w;
    const gy = (g.top_pct / 100) * h;
    data.blocks.forEach((b) => {
      const pts = [{ x: gx, y: gy }];
      (b.nav_path_pct || []).forEach((p) => {
        pts.push({ x: (p.left_pct / 100) * w, y: (p.top_pct / 100) * h });
      });
      pts.push({ x: (b.left_pct / 100) * w, y: (b.top_pct / 100) * h });
      for (let i = 0; i < pts.length - 1; i++) {
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', String(pts[i].x));
        line.setAttribute('y1', String(pts[i].y));
        line.setAttribute('x2', String(pts[i + 1].x));
        line.setAttribute('y2', String(pts[i + 1].y));
        line.setAttribute('stroke', '#ea580c');
        line.setAttribute('stroke-width', '2');
        line.setAttribute('stroke-dasharray', '7 5');
        line.setAttribute('opacity', '0.95');
        if (i === pts.length - 2) line.setAttribute('marker-end', 'url(#edArrow)');
        editorRoutePreview.appendChild(line);
      }
    });

    if (editorPillLayer) {
      while (editorPillLayer.firstChild) editorPillLayer.removeChild(editorPillLayer.firstChild);
      // Gate: allow explicit size override
      const gateDimsDefault = pillDimsScaled(data.gate.label || 'Gate', w, h, 'gate', (data.gate.style && data.gate.style.sizeScale) || 1);
      const gateRw = Number(data.gate.w_pct) ? (Number(data.gate.w_pct) / 100) * w : gateDimsDefault.rw;
      const gateRh = Number(data.gate.h_pct) ? (Number(data.gate.h_pct) / 100) * h : gateDimsDefault.rh;
      appendStyledMarker(editorPillLayer, data.gate.label || 'Gate', gx, gy, w, h, 'gate', data.gate.style, { rw: gateRw, rh: gateRh, rot_deg: data.gate.rot_deg });
      data.blocks.forEach((b, bi) => {
        const cx = (b.left_pct / 100) * w;
        const cy = (b.top_pct / 100) * h;
        const def = pillDimsScaled(b.label || b.id, w, h, 'block', (b.style && b.style.sizeScale) || data.mapUi.blockDefaults.sizeScale);
        const rw = Number(b.w_pct) ? (Number(b.w_pct) / 100) * w : def.rw;
        const rh = Number(b.h_pct) ? (Number(b.h_pct) / 100) * h : def.rh;
        appendStyledMarker(editorPillLayer, b.label || b.id, cx, cy, w, h, 'block', effectiveBlockStyleForEditor(b), { rw, rh, rot_deg: b.rot_deg, idx: bi });
      });
    }

    if (editorDotsLayer) {
      while (editorDotsLayer.firstChild) editorDotsLayer.removeChild(editorDotsLayer.firstChild);
      data.blocks.forEach((b) => {
        (b.nav_path_pct || []).forEach((p) => {
          const nc = document.createElementNS(ns, 'circle');
          nc.setAttribute('cx', String((p.left_pct / 100) * w));
          nc.setAttribute('cy', String((p.top_pct / 100) * h));
          nc.setAttribute('r', String(Math.max(3, Math.min(w, h) * 0.008)));
          nc.setAttribute('fill', '#f59e0b');
          nc.setAttribute('stroke', '#fff');
          nc.setAttribute('stroke-width', '1');
          editorDotsLayer.appendChild(nc);
        });
      });
      (data.roads || []).forEach((road) => {
        (road.polylines || []).forEach((pts) => {
          (pts || []).forEach((p) => {
            const c = document.createElementNS(ns, 'circle');
            c.setAttribute('cx', String((p.left_pct / 100) * w));
            c.setAttribute('cy', String((p.top_pct / 100) * h));
            c.setAttribute('r', String(Math.max(3, Math.min(w, h) * 0.007)));
            c.setAttribute('fill', '#64748b');
            editorDotsLayer.appendChild(c);
          });
        });
      });
    }

    // Render resize handles in a separate layer (so they receive pointer events)
    if (editorHandlesLayer) {
      while (editorHandlesLayer.firstChild) editorHandlesLayer.removeChild(editorHandlesLayer.firstChild);
      // gate handle
      const addHandle = (cx, cy, rw, rh, type, idx) => {
        const hx = cx + rw / 2;
        const hy = cy + rh / 2;
        const handle = document.createElementNS(ns, 'rect');
        const size = Math.max(8, Math.min(14, Math.min(w, h) * 0.01));
        handle.setAttribute('x', String(hx - size / 2));
        handle.setAttribute('y', String(hy - size / 2));
        handle.setAttribute('width', String(size));
        handle.setAttribute('height', String(size));
        handle.setAttribute('fill', '#2563eb');
        handle.setAttribute('stroke', '#fff');
        handle.setAttribute('stroke-width', '1');
        handle.setAttribute('cursor', 'se-resize');
        handle.setAttribute('data-type', type);
        if (idx != null) handle.setAttribute('data-i', String(idx));
        handle.addEventListener('pointerdown', startResize);
        editorHandlesLayer.appendChild(handle);
      };
      // gate
      const gateRw2 = Number(data.gate.w_pct) ? (Number(data.gate.w_pct) / 100) * w : pillDimsScaled(data.gate.label || 'Gate', w, h, 'gate', (data.gate.style && data.gate.style.sizeScale) || 1).rw;
      const gateRh2 = Number(data.gate.h_pct) ? (Number(data.gate.h_pct) / 100) * h : pillDimsScaled(data.gate.label || 'Gate', w, h, 'gate', (data.gate.style && data.gate.style.sizeScale) || 1).rh;
      addHandle(gx, gy, gateRw2, gateRh2, 'gate', null);
      // blocks
      data.blocks.forEach((b, bi) => {
        const cx = (b.left_pct / 100) * w;
        const cy = (b.top_pct / 100) * h;
        const def = pillDimsScaled(b.label || b.id, w, h, 'block', (b.style && b.style.sizeScale) || data.mapUi.blockDefaults.sizeScale);
        const rw = Number(b.w_pct) ? (Number(b.w_pct) / 100) * w : def.rw;
        const rh = Number(b.h_pct) ? (Number(b.h_pct) / 100) * h : def.rh;
        addHandle(cx, cy, rw, rh, 'block', bi);
      });
    }
  }

  function onHitClick(ev) {
    if (!pickMode) return;
    ev.preventDefault();
    const pct = clientToMapPct(ev);
    if (!pct) {
      log('无法换算坐标（请确认图片已加载，并用本项目 http://localhost:3001 打开本页）');
      return;
    }

    if (pickMode === 'gate') {
      data.gate.left_pct = pct.left_pct;
      data.gate.top_pct = pct.top_pct;
      gateInputs();
    } else if (pickMode.type === 'block') {
      data.blocks[pickMode.i].left_pct = pct.left_pct;
      data.blocks[pickMode.i].top_pct = pct.top_pct;
      renderBlockForm();
    } else if (pickMode.type === 'nav') {
      if (!Array.isArray(data.blocks[pickMode.i].nav_path_pct)) data.blocks[pickMode.i].nav_path_pct = [];
      data.blocks[pickMode.i].nav_path_pct.push({ left_pct: pct.left_pct, top_pct: pct.top_pct });
      renderBlockForm();
    } else if (pickMode.type === 'road') {
      const r = data.roads[pickMode.r];
      const s = pickMode.s;
      getRoadSeg(r, s).push({ left_pct: pct.left_pct, top_pct: pct.top_pct });
      renderRoadForm();
    }
    drawPreview();
  }

  // Helper: compute pixel coords from client event in image space
  function clientToImageXY(ev) {
    const img = editorRaster;
    const svg = editorSvg;
    if (!img || !svg) return null;
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    let ctm;
    try {
      ctm = img.getScreenCTM();
    } catch (e) {
      return null;
    }
    if (!ctm) return null;
    let p;
    try {
      p = pt.matrixTransform(ctm.inverse());
    } catch (e) {
      return null;
    }
    return { x: p.x, y: p.y };
  }

  // Resize state for pointer dragging
  let resizeState = null; // { type: 'block'|'gate', i, startX, startY, startW, startH }

  // Drag state for moving markers
  let dragState = null; // { type: 'block'|'gate', i, startX, startY, origLeft, origTop, captureTarget }

  function startDrag(ev) {
    ev.preventDefault();
    if (ev.stopPropagation) ev.stopPropagation();
    const target = ev.currentTarget || ev.target;
    // data-i only set for blocks; gate doesn't set idx on group
    const idxAttr = target.getAttribute && target.getAttribute('data-i');
    const typ = target.getAttribute && target.getAttribute('data-type');
    const p = clientToImageXY(ev);
    if (!p) return;
    const { w, h } = syncViewBox();
    if (typ === 'block' && idxAttr != null) {
      const i = Number(idxAttr);
      const b = data.blocks[i];
      if (!b) return;
      dragState = { type: 'block', i, startX: p.x, startY: p.y, origLeft: (b.left_pct / 100) * w, origTop: (b.top_pct / 100) * h };
      try { target.setPointerCapture && target.setPointerCapture(ev.pointerId); dragState.captureTarget = target; } catch (e) {}
    } else if (typ === 'gate') {
      const g = data.gate;
      dragState = { type: 'gate', i: null, startX: p.x, startY: p.y, origLeft: (g.left_pct / 100) * w, origTop: (g.top_pct / 100) * h };
      try { target.setPointerCapture && target.setPointerCapture(ev.pointerId); dragState.captureTarget = target; } catch (e) {}
    } else {
      // fallback: treat as block if data-i on parent
      const parent = target.parentElement;
      const idx = parent && parent.getAttribute && parent.getAttribute('data-i');
      if (idx != null) {
        const i = Number(idx);
        const b = data.blocks[i];
        if (!b) return;
        dragState = { type: 'block', i, startX: p.x, startY: p.y, origLeft: (b.left_pct / 100) * w, origTop: (b.top_pct / 100) * h };
        try { parent.setPointerCapture && parent.setPointerCapture(ev.pointerId); dragState.captureTarget = parent; } catch (e) {}
      }
    }
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag, { once: true });
  }

  function onDragMove(ev) {
    if (!dragState) return;
    const p = clientToImageXY(ev);
    if (!p) return;
    const dx = p.x - dragState.startX;
    const dy = p.y - dragState.startY;
    const { w, h } = syncViewBox();
    const newCx = dragState.origLeft + dx;
    const newCy = dragState.origTop + dy;
    const left_pct = Math.max(0, Math.min(100, (newCx / w) * 100));
    const top_pct = Math.max(0, Math.min(100, (newCy / h) * 100));
    if (dragState.type === 'block') {
      const b = data.blocks[dragState.i];
      if (!b) return;
      b.left_pct = Number(left_pct.toFixed(2));
      b.top_pct = Number(top_pct.toFixed(2));
      renderBlockForm();
    } else if (dragState.type === 'gate') {
      data.gate.left_pct = Number(left_pct.toFixed(2));
      data.gate.top_pct = Number(top_pct.toFixed(2));
      gateInputs();
    }
    drawPreview();
  }

  function endDrag(ev) {
    try {
      if (dragState && dragState.captureTarget && ev && ev.pointerId && dragState.captureTarget.releasePointerCapture) {
        dragState.captureTarget.releasePointerCapture(ev.pointerId);
      }
    } catch (e) {}
    window.removeEventListener('pointermove', onDragMove);
    dragState = null;
  }

  // Rotation state for pointer rotation
  let rotateState = null; // { type, i, cx, cy, startAngleDeg, startPointerAngleDeg, captureTarget }

  function startRotate(ev) {
    ev.preventDefault();
    if (ev.stopPropagation) ev.stopPropagation();
    const target = ev.currentTarget || ev.target;
    const idxAttr = target.getAttribute && target.getAttribute('data-i');
    const typ = target.getAttribute && target.getAttribute('data-type');
    const p = clientToImageXY(ev);
    if (!p) return;
    const { w, h } = syncViewBox();
    if (typ === 'block' && idxAttr != null) {
      const i = Number(idxAttr);
      const b = data.blocks[i];
      if (!b) return;
      const cx = (b.left_pct / 100) * w;
      const cy = (b.top_pct / 100) * h;
      const startPointerAngleDeg = Math.atan2(p.y - cy, p.x - cx) * (180 / Math.PI);
      const startAngleDeg = Number.isFinite(Number(b.rot_deg)) ? Number(b.rot_deg) : 0;
      rotateState = { type: 'block', i, cx, cy, startAngleDeg, startPointerAngleDeg };
      try { target.setPointerCapture && target.setPointerCapture(ev.pointerId); rotateState.captureTarget = target; } catch (e) {}
    } else if (typ === 'gate') {
      const g = data.gate;
      const cx = (g.left_pct / 100) * w;
      const cy = (g.top_pct / 100) * h;
      const startPointerAngleDeg = Math.atan2(p.y - cy, p.x - cx) * (180 / Math.PI);
      const startAngleDeg = Number.isFinite(Number(g.rot_deg)) ? Number(g.rot_deg) : 0;
      rotateState = { type: 'gate', i: null, cx, cy, startAngleDeg, startPointerAngleDeg };
      try { target.setPointerCapture && target.setPointerCapture(ev.pointerId); rotateState.captureTarget = target; } catch (e) {}
    }
    window.addEventListener('pointermove', onRotateMove);
    window.addEventListener('pointerup', endRotate, { once: true });
  }

  function onRotateMove(ev) {
    if (!rotateState) return;
    const p = clientToImageXY(ev);
    if (!p) return;
    const curPtrAng = Math.atan2(p.y - rotateState.cy, p.x - rotateState.cx) * (180 / Math.PI);
    let delta = curPtrAng - rotateState.startPointerAngleDeg;
    // normalize delta to [-180,180]
    delta = ((delta + 180) % 360) - 180;
    const newAngle = rotateState.startAngleDeg + delta;
    if (rotateState.type === 'block') {
      const b = data.blocks[rotateState.i];
      if (!b) return;
      b.rot_deg = Math.round(newAngle);
      renderBlockForm();
    } else if (rotateState.type === 'gate') {
      data.gate.rot_deg = Math.round(newAngle);
      gateInputs();
    }
    drawPreview();
  }

  function endRotate(ev) {
    try {
      if (rotateState && rotateState.captureTarget && ev && ev.pointerId && rotateState.captureTarget.releasePointerCapture) {
        rotateState.captureTarget.releasePointerCapture(ev.pointerId);
      }
    } catch (e) {}
    window.removeEventListener('pointermove', onRotateMove);
    rotateState = null;
  }

  function startResize(ev) {
    ev.preventDefault();
    // ensure the handle's pointerdown doesn't bubble to the hit rect
    if (ev.stopPropagation) ev.stopPropagation();
    const target = ev.currentTarget || ev.target;
    const typ = target.getAttribute('data-type');
    const idx = target.getAttribute('data-i');
    const p = clientToImageXY(ev);
    if (!p) return;
    const { w, h } = syncViewBox();
    let startW = 0;
    let startH = 0;
    if (typ === 'block') {
      const b = data.blocks[Number(idx)];
      if (!b) return;
      startW = Number(b.w_pct) ? (Number(b.w_pct) / 100) * w : pillDimsScaled(b.label, w, h, 'block', (b.style && b.style.sizeScale) || data.mapUi.blockDefaults.sizeScale).rw;
      startH = Number(b.h_pct) ? (Number(b.h_pct) / 100) * h : pillDimsScaled(b.label, w, h, 'block', (b.style && b.style.sizeScale) || data.mapUi.blockDefaults.sizeScale).rh;
      resizeState = { type: 'block', i: Number(idx), startX: p.x, startY: p.y, startW, startH };
      // capture pointer so moves outside the handle still deliver events
      try { target.setPointerCapture && target.setPointerCapture(ev.pointerId); resizeState.captureTarget = target; } catch (e) {}
    } else if (typ === 'gate') {
      const g = data.gate;
      startW = Number(g.w_pct) ? (Number(g.w_pct) / 100) * w : pillDimsScaled(g.label, w, h, 'gate', (g.style && g.style.sizeScale) || g.style.sizeScale).rw;
      startH = Number(g.h_pct) ? (Number(g.h_pct) / 100) * h : pillDimsScaled(g.label, w, h, 'gate', (g.style && g.style.sizeScale) || g.style.sizeScale).rh;
      resizeState = { type: 'gate', i: null, startX: p.x, startY: p.y, startW, startH };
      try { target.setPointerCapture && target.setPointerCapture(ev.pointerId); resizeState.captureTarget = target; } catch (e) {}
    }
    // Listen on window for pointer moves/up
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', endResize, { once: true });
  }


  // Make sure form bindings still refresh after we added inputs
  function bindGateInputs() {
    document.getElementById('gateLabel').addEventListener('input', () => {
      data.gate.label = document.getElementById('gateLabel').value;
      drawPreview();
    });
    document.getElementById('gateLeft').addEventListener('change', () => {
      data.gate.left_pct = Number(document.getElementById('gateLeft').value) || 0;
      gateInputs();
      drawPreview();
    });
    document.getElementById('gateTop').addEventListener('change', () => {
      data.gate.top_pct = Number(document.getElementById('gateTop').value) || 0;
      gateInputs();
      drawPreview();
    });
    const gw = document.getElementById('gateW');
    const gh = document.getElementById('gateH');
    if (gw && !gw._bound) {
      gw._bound = true;
      gw.addEventListener('change', () => {
        const v = Number(gw.value);
        if (Number.isFinite(v) && v > 0) data.gate.w_pct = v;
        else delete data.gate.w_pct;
        drawPreview();
      });
    }
    if (gh && !gh._bound) {
      gh._bound = true;
      gh.addEventListener('change', () => {
        const v = Number(gh.value);
        if (Number.isFinite(v) && v > 0) data.gate.h_pct = v;
        else delete data.gate.h_pct;
        drawPreview();
      });
    }
    const gr = document.getElementById('gateRot');
    if (gr && !gr._bound) {
      gr._bound = true;
      gr.addEventListener('change', () => {
        const v = Number(gr.value);
        if (Number.isFinite(v)) data.gate.rot_deg = v;
        else delete data.gate.rot_deg;
        drawPreview();
      });
    }
  }

  async function loadLevels() {
    try {
      const r = await fetch('data/campus_mapped_improved.json');
      if (!r.ok) return;
      const j = await r.json();
      levelOptions = (j.levels || []).map((l) => ({ id: l.id, name: l.name || l.id }));
    } catch (e) {
      levelOptions = [];
    }
  }

  async function loadMap() {
    try {
      const r = await fetch(API + '?t=' + Date.now());
      if (!r.ok) throw new Error('GET ' + r.status + ' — 请用本仓库 server 访问（默认 http://localhost:3001/map_editor.html），勿用 test web 的 3000 或 file://');
      const raw = await r.json();
      data = normalizeData(raw);
      roadEditSeg.clear();
    } catch (e) {
      log(String(e.message));
      data = normalizeData(data);
    }
    gateInputs();
    syncOverviewStyleFromData();
    bindOverviewStyles();
    renderBlockForm();
    renderRoadForm();
    drawPreview();
    log((data.blocks && data.blocks.length ? `已加载 ${data.blocks.length} 个楼块。` : '') + ' 修改后点「保存到服务器」。');
  }

  async function saveMap() {
    try {
      const payload = dataForSave();
      const opts = {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      };
      let r = await fetch(API, { method: 'PUT', ...opts });
      if (r.status === 404) {
        r = await fetch(API, { method: 'POST', ...opts });
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || r.status + ' ' + r.statusText);
      log('保存成功（已写入 data/block_map.json）。回到主页刷新即可。');
      // Notify other windows/tabs (overview/index) that the block map changed so they can reload automatically.
      try {
        const bc = new BroadcastChannel('block-map');
        bc.postMessage({ updated: Date.now() });
        bc.close();
      } catch (e) {
        try {
          localStorage.setItem('block_map_updated', String(Date.now()));
        } catch (e2) {
          // ignore if storage not available
        }
      }
    } catch (e) {
      log(
        '保存失败: ' +
          e.message +
          '\n请确认：1) 终端里运行的是本目录 ./run_all.sh；2) 启动日志里有「Block map editor: … /api/block-map」；3) 浏览器地址为 http://localhost:3001/map_editor.html（不要用 3000 或其它项目）。'
      );
    }
  }

  function downloadJson() {
    const blob = new Blob([JSON.stringify(dataForSave(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'block_map.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  document.getElementById('pickGate').addEventListener('click', () => {
    pickMode = 'gate';
    updatePickStatus();
  });
  document.getElementById('pickIdle').addEventListener('click', () => {
    pickMode = null;
    updatePickStatus();
  });
  document.getElementById('addBlock').addEventListener('click', () => {
    const id = 'Block_' + Date.now().toString(36).slice(-4);
    const lv = levelOptions[0] && levelOptions[0].id ? levelOptions[0].id : 'level-1';
    data.blocks.push({
      id,
      label: 'New block',
      left_pct: 50,
      top_pct: 50,
      levelId: lv,
      nav_path_pct: [],
    });
    renderBlockForm();
    drawPreview();
  });
  document.getElementById('addRoad').addEventListener('click', () => {
    const id = 'road_' + Date.now().toString(36).slice(-5);
    const idx = data.roads.length;
    data.roads.push({ id, label: 'Walkway', polylines: [[]] });
    roadEditSeg.set(idx, 0);
    renderRoadForm();
    drawPreview();
  });
  document.getElementById('btnSave').addEventListener('click', saveMap);
  document.getElementById('btnReload').addEventListener('click', loadMap);
  document.getElementById('btnDownload').addEventListener('click', downloadJson);

  if (editorHitRect) {
    editorHitRect.addEventListener('click', onHitClick);
  } else {
    editorSvg.addEventListener('click', onHitClick);
  }

  editorRaster.addEventListener('load', () => {
    syncViewBox();
    drawPreview();
  });

  bindGateInputs();

  (async function boot() {
    await loadLevels();
    await loadMap();
    if (!editorRaster.complete) {
      await new Promise((res) => {
        editorRaster.addEventListener('load', res, { once: true });
        editorRaster.addEventListener('error', res, { once: true });
      });
    }
    syncViewBox();
    drawPreview();
    updatePickStatus();
  })();
})();
