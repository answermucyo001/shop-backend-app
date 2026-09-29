const router = require('express').Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db');
const { auth } = require('../middleware/auth');

router.post('/login', async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
    const [[u]] = await db.query('SELECT * FROM users WHERE username = ? AND active = 1', [String(username).trim()]);
    // Same message for wrong user or password (don't reveal which)
    if (!u || !(await bcrypt.compare(String(password), u.password_hash)))
      return res.status(401).json({ error: 'Wrong username or password' });
    const user = { id: u.id, username: u.username, name: u.full_name, role: u.role };
    const token = jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '12h' });
    res.json({ token, user });
  } catch (e) { next(e); }
});
router.get('/me', auth, (req, res) => res.json({ user: req.user }));
module.exports = router;
