const BACKEND_BASE = window.BACKEND_BASE || 'http://localhost:3000';
const HEALTH_POLL_INTERVAL = 2000;

window.backendAvailable = false;
let __lastBackendOk = null;

function _emitBackendEvent(up) {
  try {
    window.dispatchEvent(new CustomEvent(up ? 'backend:up' : 'backend:down'));
  } catch (e) { /* ignore */ }
}

async function _checkBackendOnce() {
  try {
    const res = await fetch(BACKEND_BASE + '/api/classrooms', { method: 'HEAD', cache: 'no-store' });
    const ok = !!(res && res.ok);
    window.backendAvailable = ok;
    if (__lastBackendOk !== ok) {
      __lastBackendOk = ok;
      _emitBackendEvent(ok);
    }
    return ok;
  } catch (e) {
    window.backendAvailable = false;
    if (__lastBackendOk !== false) {
      __lastBackendOk = false;
      _emitBackendEvent(false);
    }
    return false;
  }
}

setTimeout(() => {
  _checkBackendOnce();
  setInterval(_checkBackendOnce, HEALTH_POLL_INTERVAL);
}, 400);

async function getClassrooms() {
  try {
    const res = await fetch(BACKEND_BASE + '/api/classrooms', { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data || !data.success) return Array.isArray(data && data.data) ? data.data : [];
    return data.data || [];
  } catch (e) {
    return [];
  }
}

async function getClassroomById(id) {
  const res = await fetch(BACKEND_BASE + `/api/classrooms/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data || !data.success) throw new Error(data && data.message ? data.message : 'Failed to load');
  return data.data;
}

async function searchCampus(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  const res = await fetch(BACKEND_BASE + '/api/search?' + new URLSearchParams({ q }), { cache: 'no-store' });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data || !data.success) throw new Error(data && data.message ? data.message : 'Search failed');
  return data.data || [];
}

window.getClassrooms = getClassrooms;
window.getClassroomById = getClassroomById;
window.searchCampus = searchCampus;
window.checkBackend = _checkBackendOnce;
