const userModel = require('../models/userModel');

function validEmail(s) {
  const t = String(s || '').trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);
}

function validPassword(p) {
  const t = String(p || '');
  return t.length > 8 && /[a-zA-Z]/.test(t) && /[0-9]/.test(t);
}

exports.login = async (req, res) => {
  try {
    const email = String(req.body && req.body.email ? req.body.email : '').trim();
    const password = String(req.body && req.body.password ? req.body.password : '');
    if (!validEmail(email)) return res.status(400).json({ success: false, message: 'Invalid email' });
    if (!validPassword(password)) return res.status(400).json({ success: false, message: 'Invalid password format' });
    const user = await userModel.findByEmail(email);
    if (!user || String(user.password) !== password) {
      return res.status(401).json({ success: false, message: 'Email or password incorrect' });
    }
    return res.json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

exports.getUser = async (req, res) => {
  try {
    const email = String(req.query && req.query.email ? req.query.email : '').trim();
    if (!validEmail(email)) return res.status(400).json({ success: false, message: 'Invalid email' });
    const user = await userModel.publicByEmail(email);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    return res.json({ success: true, data: user });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

/** Save new account (email + password) in SQLite. */
exports.register = async (req, res) => {
  try {
    const email = String(req.body && req.body.email ? req.body.email : '').trim();
    const password = String(req.body && req.body.password ? req.body.password : '');
    const displayName =
      req.body && req.body.displayName != null ? String(req.body.displayName).trim() : '';
    /** Public signup is always student; demo/seed accounts use DB seed or admin tooling. */
    const role = 'student';

    if (!validEmail(email)) return res.status(400).json({ success: false, message: 'Invalid email' });
    if (!validPassword(password)) return res.status(400).json({ success: false, message: 'Invalid password format' });

    const existing = await userModel.findByEmail(email);
    if (existing) {
      return res.status(409).json({ success: false, message: 'Account already exists for this email' });
    }

    const created = await userModel.createUser(email, password, displayName, role);
    return res.status(201).json({
      success: true,
      data: {
        id: created.id,
        email: created.email,
        displayName: created.displayName,
        role: created.role,
      },
    });
  } catch (err) {
    if (String(err.message || '').includes('UNIQUE')) {
      return res.status(409).json({ success: false, message: 'Account already exists for this email' });
    }
    return res.status(500).json({ success: false, message: err.message });
  }
};
