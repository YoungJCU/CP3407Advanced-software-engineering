const db = require('../database/db');

exports.getAll = (req, res) => {
  db.all('SELECT * FROM mappings', [], (err, rows) => {
    if (err) return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, data: rows });
  });
};

exports.upsert = (req, res) => {
  const { name_key, classroom_id } = req.body;
  if (!name_key || !classroom_id) return res.status(400).json({ success: false, message: 'Missing fields' });
  // Use INSERT OR REPLACE to upsert based on unique name_key
  const stmt = db.prepare('INSERT OR REPLACE INTO mappings (name_key, classroom_id) VALUES (?,?)');
  stmt.run(name_key, classroom_id, function(err){
    if (err) return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, data: { name_key, classroom_id } });
  });
};

exports.delete = (req, res) => {
  const id = req.params.id;
  db.run('DELETE FROM mappings WHERE id = ?', [id], function(err){
    if (err) return res.status(500).json({ success: false, message: err.message });
    return res.json({ success: true, deleted: this.changes });
  });
};
