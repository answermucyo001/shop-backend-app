const router = require('express').Router();
const db = require('../db');
const { ownerOnly } = require('../middleware/auth');

// Validate and normalise product input. Returns {error} or {data}.
function clean(b) {
  const name = String(b.name || '').trim();
  const category = String(b.category || 'General').trim() || 'General';
  const barcode = String(b.barcode || '').trim() || null;
  const buy = Number(b.buy_price), sell = Number(b.sell_price);
  const qty = Number(b.quantity ?? 0), min = Number(b.min_stock ?? 5);
  if (!name) return { error: 'Product name is required' };
  if (!(buy >= 0) || !(sell >= 0)) return { error: 'Prices must be zero or more' };
  if (!Number.isInteger(qty) || qty < 0 || !Number.isInteger(min) || min < 0) return { error: 'Quantity and minimum stock must be whole numbers, zero or more' };
  return { data: { name, category, barcode, buy_price: buy, sell_price: sell, quantity: qty, min_stock: min } };
}
const dupMsg = (e, res, next) => e.code === 'ER_DUP_ENTRY' ? res.status(409).json({ error: 'This barcode is already used by another product' }) : next(e);

// List / search. Cashiers only see active products and never see buying prices.
router.get('/', async (req, res, next) => {
  try {
    const owner = req.user.role === 'owner';
    const where = [], params = [];
    if (!owner || req.query.include_inactive !== '1') where.push('active = 1');
    if (req.query.q) { where.push('(name LIKE ? OR barcode LIKE ?)'); params.push(`%${req.query.q}%`, `%${req.query.q}%`); }
    if (req.query.category) { where.push('category = ?'); params.push(req.query.category); }
    const cols = owner ? '*' : 'id, name, category, barcode, sell_price, quantity, active';
    const [rows] = await db.query(`SELECT ${cols} FROM products ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name LIMIT 200`, params);
    res.json(rows);
  } catch (e) { next(e); }
});
router.get('/categories', async (req, res, next) => {
  try { const [r] = await db.query('SELECT DISTINCT category FROM products ORDER BY category'); res.json(r.map(x => x.category)); } catch (e) { next(e); }
});
router.get('/low-stock', ownerOnly, async (req, res, next) => {
  try { const [r] = await db.query('SELECT * FROM products WHERE active = 1 AND quantity <= min_stock ORDER BY quantity'); res.json(r); } catch (e) { next(e); }
});
router.get('/movements', ownerOnly, async (req, res, next) => {
  try {
    const [r] = await db.query(`SELECT m.*, p.name AS product_name, u.full_name AS user_name FROM stock_movements m
      JOIN products p ON p.id = m.product_id LEFT JOIN users u ON u.id = m.user_id
      ${req.query.product_id ? 'WHERE m.product_id = ?' : ''} ORDER BY m.id DESC LIMIT 100`, req.query.product_id ? [req.query.product_id] : []);
    res.json(r);
  } catch (e) { next(e); }
});

router.post('/', ownerOnly, async (req, res, next) => {
  const { error, data } = clean(req.body || {});
  if (error) return res.status(400).json({ error });
  try {
    const [r] = await db.query('INSERT INTO products SET ?', [data]);
    if (data.quantity > 0) await db.query("INSERT INTO stock_movements (product_id, type, quantity, note, user_id) VALUES (?, 'initial', ?, 'Opening stock', ?)", [r.insertId, data.quantity, req.user.id]);
    res.status(201).json({ id: r.insertId });
  } catch (e) { dupMsg(e, res, next); }
});

// Edit details (not quantity: use restock/adjust so every change is logged)
router.put('/:id', ownerOnly, async (req, res, next) => {
  const { error, data } = clean({ ...req.body, quantity: 0 });
  if (error) return res.status(400).json({ error });
  delete data.quantity;
  data.active = req.body.active === false || req.body.active === 0 ? 0 : 1;
  try {
    const [r] = await db.query('UPDATE products SET ? WHERE id = ?', [data, req.params.id]);
    if (!r.affectedRows) return res.status(404).json({ error: 'Product not found' });
    res.json({ ok: true });
  } catch (e) { dupMsg(e, res, next); }
});

// Restock (+) or adjustment (+/-). Locks the row so it is safe with concurrent sales.
router.post('/:id/stock', ownerOnly, async (req, res, next) => {
  const type = req.body.type === 'adjustment' ? 'adjustment' : 'restock';
  const qty = Number(req.body.quantity);
  if (!Number.isInteger(qty) || qty === 0) return res.status(400).json({ error: 'Quantity must be a whole number' });
  if (type === 'restock' && qty < 0) return res.status(400).json({ error: 'Restock quantity must be positive' });
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[p]] = await conn.query('SELECT quantity FROM products WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!p) { await conn.rollback(); return res.status(404).json({ error: 'Product not found' }); }
    if (p.quantity + qty < 0) { await conn.rollback(); return res.status(400).json({ error: 'Stock cannot go below zero' }); }
    await conn.query('UPDATE products SET quantity = quantity + ? WHERE id = ?', [qty, req.params.id]);
    await conn.query('INSERT INTO stock_movements (product_id, type, quantity, note, user_id) VALUES (?,?,?,?,?)', [req.params.id, type, qty, String(req.body.note || '').slice(0, 255) || null, req.user.id]);
    await conn.commit();
    res.json({ ok: true, quantity: p.quantity + qty });
  } catch (e) { await conn.rollback(); next(e); } finally { conn.release(); }
});

// Delete only if never sold; otherwise deactivate (keeps sales history intact)
router.delete('/:id', ownerOnly, async (req, res, next) => {
  try {
    const [[used]] = await db.query('SELECT COUNT(*) AS n FROM sale_items WHERE product_id = ?', [req.params.id]);
    if (used.n > 0) {
      await db.query('UPDATE products SET active = 0 WHERE id = ?', [req.params.id]);
      return res.json({ ok: true, deactivated: true });
    }
    await db.query('DELETE FROM stock_movements WHERE product_id = ?', [req.params.id]);
    await db.query('DELETE FROM products WHERE id = ?', [req.params.id]);
    res.json({ ok: true, deactivated: false });
  } catch (e) { next(e); }
});
module.exports = router;
