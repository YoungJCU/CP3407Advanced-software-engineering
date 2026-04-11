/* '' = same-origin (e.g. http://localhost:3001). Falsy '' must NOT fall back to another port. */
const BACKEND_BASE =
  typeof window.BACKEND_BASE === 'string' ? window.BACKEND_BASE : 'http://localhost:3001';
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
    /* Express only registers GET here — HEAD often returns 404, which wrongly marked backend down */
    const res = await fetch(BACKEND_BASE + '/api/classrooms', { method: 'GET', cache: 'no-store' });
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

async function loginUser(email, password) {
  const res = await fetch(BACKEND_BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data && data.message) || 'HTTP ' + res.status);
    err.status = res.status;
    throw err;
  }
  if (!data || !data.success) {
    const err = new Error((data && data.message) || 'Login failed');
    err.status = res.status;
    throw err;
  }
  return data.data;
}

/** Create account (email + password stored in SQLite). */
async function registerUser(email, password, displayName) {
  const res = await fetch(BACKEND_BASE + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    body: JSON.stringify({
      email,
      password,
      ...(displayName != null && String(displayName).trim() ? { displayName: String(displayName).trim() } : {}),
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error((data && data.message) || 'HTTP ' + res.status);
    err.status = res.status;
    throw err;
  }
  if (!data || !data.success) {
    const err = new Error((data && data.message) || 'Register failed');
    err.status = res.status;
    throw err;
  }
  return data.data;
}

async function getUserProfile(email) {
  const res = await fetch(BACKEND_BASE + '/api/auth/user?' + new URLSearchParams({ email: String(email || '') }), {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();
  if (!data || !data.success) throw new Error((data && data.message) || 'Profile failed');
  return data.data;
}

window.getClassrooms = getClassrooms;
window.getClassroomById = getClassroomById;
window.searchCampus = searchCampus;
window.loginUser = loginUser;
window.registerUser = registerUser;
window.getUserProfile = getUserProfile;
window.checkBackend = _checkBackendOnce;
