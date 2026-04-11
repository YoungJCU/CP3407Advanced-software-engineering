/**
 * Register GET/PUT/POST /api/block-map on the Express app (explicit paths — avoids mount issues).
 */
const fs = require('fs');
const path = require('path');

const STYLE_SHAPES = new Set(['pill', 'rect', 'circle']);

function validateMarkerStyle(st, label) {
  if (st == null) return null;
  if (typeof st !== 'object' || Array.isArray(st)) return `${label} must be an object`;
  if (st.sizeScale != null && !Number.isFinite(Number(st.sizeScale))) return `${label}.sizeScale invalid`;
  if (st.fillOpacity != null && !Number.isFinite(Number(st.fillOpacity))) return `${label}.fillOpacity invalid`;
  if (st.labelOpacity != null && !Number.isFinite(Number(st.labelOpacity))) return `${label}.labelOpacity invalid`;
  if (st.shape != null && !STYLE_SHAPES.has(String(st.shape))) return `${label}.shape must be pill | rect | circle`;
  return null;
}

function validateBody(data) {
  if (!data || typeof data !== 'object') return 'Body must be a JSON object';
  if (data.mapUi != null) {
    if (typeof data.mapUi !== 'object' || Array.isArray(data.mapUi)) return 'mapUi must be an object';
    if (data.mapUi.overviewIntro != null && typeof data.mapUi.overviewIntro !== 'string') {
      return 'mapUi.overviewIntro must be a string';
    }
    if (String(data.mapUi.overviewIntro || '').length > 12000) return 'mapUi.overviewIntro too long';
    const bde = validateMarkerStyle(data.mapUi.blockDefaults, 'mapUi.blockDefaults');
    if (bde) return bde;
  }
  if (!data.gate || typeof data.gate !== 'object') return 'Missing gate';
  const gl = Number(data.gate.left_pct);
  const gt = Number(data.gate.top_pct);
  if (!Number.isFinite(gl) || !Number.isFinite(gt)) return 'gate.left_pct / gate.top_pct must be numbers';
  const gse = validateMarkerStyle(data.gate.style, 'gate.style');
  if (gse) return gse;
  // Optional gate rotation in degrees
  if (data.gate.rot_deg != null) {
    const gr = Number(data.gate.rot_deg);
    if (!Number.isFinite(gr) || gr < -360 || gr > 360) return 'gate.rot_deg must be a number between -360 and 360';
  }
  if (!Array.isArray(data.blocks)) return 'blocks must be an array';
  for (let i = 0; i < data.blocks.length; i++) {
    const b = data.blocks[i];
    if (!b || typeof b !== 'object') return `blocks[${i}] invalid`;
    if (b.id == null || String(b.id).trim() === '') return `blocks[${i}].id required`;
    if (b.levelId == null || String(b.levelId).trim() === '') return `blocks[${i}].levelId required`;
    const lp = Number(b.left_pct);
    const tp = Number(b.top_pct);
    if (!Number.isFinite(lp) || !Number.isFinite(tp)) return `blocks[${i}] position invalid`;
    const bse = validateMarkerStyle(b.style, `blocks[${i}].style`);
    if (bse) return bse;
    // Optional width/height percentages (relative to the whole campus image). If provided, enforce numeric
    // values in the sensible range (0.1 - 100). This keeps the editor robust to bad input.
    if (b.w_pct != null) {
      const wp = Number(b.w_pct);
      if (!Number.isFinite(wp) || wp < 0.1 || wp > 100) return `blocks[${i}].w_pct must be a number between 0.1 and 100`;
    }
    if (b.h_pct != null) {
      const hp = Number(b.h_pct);
      if (!Number.isFinite(hp) || hp < 0.1 || hp > 100) return `blocks[${i}].h_pct must be a number between 0.1 and 100`;
    }
    if (b.rot_deg != null) {
      const br = Number(b.rot_deg);
      if (!Number.isFinite(br) || br < -360 || br > 360) return `blocks[${i}].rot_deg must be a number between -360 and 360`;
    }
  }
  if (data.roads != null && !Array.isArray(data.roads)) return 'roads must be an array';
  if (Array.isArray(data.roads)) {
    for (let i = 0; i < data.roads.length; i++) {
      const r = data.roads[i];
      if (!r || typeof r !== 'object') return `roads[${i}] invalid`;
      if (r.points_pct != null && !Array.isArray(r.points_pct)) return `roads[${i}].points_pct must be an array`;
      if (r.polylines != null && !Array.isArray(r.polylines)) return `roads[${i}].polylines must be an array`;
      if (Array.isArray(r.polylines)) {
        for (const seg of r.polylines) {
          if (!Array.isArray(seg)) return `roads[${i}].polylines must be an array of arrays`;
        }
      }
    }
  }
  return null;
}

function registerBlockMapRoutes(app, clientDir) {
  const blockMapPath = path.join(clientDir, 'data', 'block_map.json');

  function getHandler(req, res) {
    fs.readFile(blockMapPath, 'utf8', (err, data) => {
      if (err) {
        return res.status(err.code === 'ENOENT' ? 404 : 500).json({ error: String(err.message) });
      }
      res.type('json').send(data);
    });
  }

  function putHandler(req, res) {
    const errMsg = validateBody(req.body);
    if (errMsg) return res.status(400).json({ error: errMsg });
    const text = JSON.stringify(req.body, null, 2);
    fs.writeFile(blockMapPath, text, 'utf8', (err) => {
      if (err) return res.status(500).json({ error: String(err.message) });
      res.json({ ok: true });
    });
  }

  app.get('/api/block-map', getHandler);
  app.put('/api/block-map', putHandler);
  app.post('/api/block-map', putHandler);
  console.log('Block map editor: GET | PUT | POST /api/block-map →', blockMapPath);
}

module.exports = registerBlockMapRoutes;
