const router = require('express').Router();
const bcrypt = require('bcrypt');
const db = require('../db');
router.get('/', async (req, res, next) => {
  try { const [r] = await db.query('SELECT id, username, full_name, role, active, created_at FROM users ORDER BY id'); res.json(r); } catch (e) { next(e); }
});
router.post('/', async (req, res, next) => {
  const { username, full_name, password, role } = req.body || {};
  if (!username?.trim() || !full_name?.trim()) return res.status(400).json({ error: 'Username and full name are required' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!['owner', 'cashier'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  try {
    const [r] = await db.query('INSERT INTO users (username, full_name, password_hash, role) VALUES (?,?,?,?)', [username.trim(), full_name.trim(), await bcrypt.hash(password, 10), role]);
    res.status(201).json({ id: r.insertId });
  } catch (e) { e.code === 'ER_DUP_ENTRY' ? res.status(409).json({ error: 'Username already taken' }) : next(e); }
});
router.put('/:id', async (req, res, next) => {
  const { full_name, password, role, active } = req.body || {};
  if (Number(req.params.id) === req.user.id && (active === false || role === 'cashier')) return res.status(400).json({ error: 'You cannot deactivate or demote yourself' });
  if (!full_name?.trim() || !['owner', 'cashier'].includes(role)) return res.status(400).json({ error: 'Invalid input' });
  if (password && password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  try {
    const data = { full_name: full_name.trim(), role, active: active === false ? 0 : 1 };
    if (password) data.password_hash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET ? WHERE id = ?', [data, req.params.id]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});
module.exports = router;
