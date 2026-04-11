const db = require('../database/db');

exports.findByEmail = (email) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id, email, displayName, role, password FROM users WHERE lower(email)=lower(?)',
      [String(email || '').trim()],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
};

exports.publicByEmail = (email) => {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id, email, displayName, role FROM users WHERE lower(email)=lower(?)',
      [String(email || '').trim()],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
};

exports.createUser = (email, password, displayName, role) => {
  return new Promise((resolve, reject) => {
    const em = String(email || '').trim();
    const dn = String(displayName || '').trim() || em.split('@')[0] || 'User';
    const rl = String(role || 'student').trim() || 'student';
    db.run(
      'INSERT INTO users (email, displayName, role, password) VALUES (?,?,?,?)',
      [em, dn, rl, String(password)],
      function onRun(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, email: em, displayName: dn, role: rl });
      }
    );
  });
};

/** Remove rows with empty/invalid email or empty password (junk data). */
exports.deleteInvalidRows = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, email, password FROM users', [], (err, rows) => {
      if (err) return reject(err);
      const toDelete = [];
      (rows || []).forEach((r) => {
        const em = String(r.email || '').trim();
        const pw = String(r.password || '');
        if (!em || !pw || em.length < 5 || !em.includes('@') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
          toDelete.push(r.id);
        }
      });
      if (toDelete.length === 0) return resolve({ deleted: 0 });
      const ph = toDelete.map(() => '?').join(',');
      db.run(`DELETE FROM users WHERE id IN (${ph})`, toDelete, (err2) => {
        if (err2) return reject(err2);
        resolve({ deleted: toDelete.length });
      });
    });
  });
};

/** Keep one row per lower(email); deletes older duplicate ids. */
exports.dedupeByEmailLower = () => {
  return new Promise((resolve, reject) => {
    db.all('SELECT id, lower(trim(email)) AS lem FROM users ORDER BY id', [], (err, rows) => {
      if (err) return reject(err);
      const seen = new Set();
      const dupIds = [];
      (rows || []).forEach((r) => {
        const key = String(r.lem || '').trim();
        if (!key) {
          dupIds.push(r.id);
          return;
        }
        if (seen.has(key)) dupIds.push(r.id);
        else seen.add(key);
      });
      if (dupIds.length === 0) return resolve({ deleted: 0 });
      const ph = dupIds.map(() => '?').join(',');
      db.run(`DELETE FROM users WHERE id IN (${ph})`, dupIds, (err2) => {
        if (err2) return reject(err2);
        resolve({ deleted: dupIds.length });
      });
    });
  });
};
