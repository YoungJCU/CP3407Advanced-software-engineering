const db = require('../database/db');

exports.getAll = (req, res) => {
  db.all('SELECT * FROM hotspots', [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, data: rows });
  });
};

exports.create = (req, res) => {
  const { name, left_pct, top_pct } = req.body;
  if (!name || left_pct == null || top_pct == null) return res.status(400).json({ success: false, message: 'Missing fields' });
  const stmt = db.prepare('INSERT INTO hotspots (name, left_pct, top_pct) VALUES (?,?,?)');
  stmt.run(name, left_pct, top_pct, function(err){
    if (err) return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, data: { id: this.lastID, name, left_pct, top_pct } });
  });
};

exports.delete = (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM hotspots WHERE id = ?', [id], function(err){
    if (err) return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, deleted: this.changes });
  });
};
