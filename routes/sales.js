const router = require('express').Router();
const crypto = require('crypto');
const db = require('../db');
const METHODS = ['cash', 'mtn_momo', 'airtel_money', 'credit'];

// Load a sale with its items (used for receipts)
async function loadSale(id) {
  const [[s]] = await db.query('SELECT s.*, u.full_name AS cashier FROM sales s JOIN users u ON u.id = s.user_id WHERE s.id = ?', [id]);
  if (!s) return null;
  const [items] = await db.query('SELECT product_name, quantity, price FROM sale_items WHERE sale_id = ?', [id]);
  return { ...s, items, shop_name: process.env.SHOP_NAME || 'My Shop' };
}

// Create a sale. Everything happens in ONE transaction; product rows are locked
// (FOR UPDATE) so two cashiers can never oversell the same item.
router.post('/', async (req, res, next) => {
  const { items, payment_method } = req.body || {};
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'Cart is empty' });
  if (!METHODS.includes(payment_method)) return res.status(400).json({ error: 'Choose a valid payment method' });
  const map = new Map(); // merge duplicate lines and validate quantities
  for (const i of items) {
    const id = Number(i.product_id), q = Number(i.quantity);
    if (!Number.isInteger(id) || !Number.isInteger(q) || q <= 0) return res.status(400).json({ error: 'Invalid item or quantity' });
    map.set(id, (map.get(id) || 0) + q);
  }
  const ids = [...map.keys()].sort((a, b) => a - b); // fixed lock order avoids deadlocks
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [prods] = await conn.query('SELECT * FROM products WHERE id IN (?) ORDER BY id FOR UPDATE', [ids]);
    if (prods.length !== ids.length) throw { status: 400, msg: 'A product in the cart no longer exists' };
    let total = 0;
    for (const p of prods) {
      const q = map.get(p.id);
      if (!p.active) throw { status: 400, msg: `${p.name} is not available` };
      if (p.quantity < q) throw { status: 409, msg: `Not enough stock for ${p.name} (only ${p.quantity} left)` };
      total += p.sell_price * q; // price comes from DB, never from the browser
    }
    let paid = Number(req.body.amount_paid);
    if (payment_method === 'credit') paid = Number.isFinite(paid) && paid >= 0 ? Math.min(paid, total) : 0;
    else if (payment_method !== 'cash') paid = total;
    else if (!(paid >= total)) throw { status: 400, msg: 'Amount paid is less than the total' };
    const change = Math.max(0, paid - total);
    const [r] = await conn.query('INSERT INTO sales (receipt_no, user_id, total, amount_paid, change_given, payment_method) VALUES (?,?,?,?,?,?)',
      ['TMP' + crypto.randomBytes(6).toString('hex'), req.user.id, total, paid, change, payment_method]);
    const receiptNo = 'R' + String(r.insertId).padStart(6, '0');
    await conn.query('UPDATE sales SET receipt_no = ? WHERE id = ?', [receiptNo, r.insertId]);
    for (const p of prods) {
      const q = map.get(p.id);
      await conn.query('INSERT INTO sale_items (sale_id, product_id, product_name, quantity, price, buy_price) VALUES (?,?,?,?,?,?)', [r.insertId, p.id, p.name, q, p.sell_price, p.buy_price]);
      await conn.query('UPDATE products SET quantity = quantity - ? WHERE id = ?', [q, p.id]);
      await conn.query("INSERT INTO stock_movements (product_id, type, quantity, note, user_id, sale_id) VALUES (?, 'sale', ?, ?, ?, ?)", [p.id, -q, receiptNo, req.user.id, r.insertId]);
    }
    await conn.commit();
    res.status(201).json(await loadSale(r.insertId));
  } catch (e) {
    await conn.rollback();
    if (e.status) return res.status(e.status).json({ error: e.msg });
    next(e);
  } finally { conn.release(); }
});

// History. Cashiers only see their own sales; owner can filter by cashier.
router.get('/', async (req, res, next) => {
  try {
    const where = [], params = [];
    if (req.user.role !== 'owner') { where.push('s.user_id = ?'); params.push(req.user.id); }
    else if (req.query.cashier_id) { where.push('s.user_id = ?'); params.push(req.query.cashier_id); }
    if (req.query.from) { where.push('s.created_at >= ?'); params.push(req.query.from + ' 00:00:00'); }
    if (req.query.to) { where.push('s.created_at <= ?'); params.push(req.query.to + ' 23:59:59'); }
    const [rows] = await db.query(`SELECT s.id, s.receipt_no, s.total, s.payment_method, s.created_at, u.full_name AS cashier
      FROM sales s JOIN users u ON u.id = s.user_id ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY s.id DESC LIMIT 200`, params);
    res.json(rows);
  } catch (e) { next(e); }
});
router.get('/:id', async (req, res, next) => {
  try {
    const s = await loadSale(req.params.id);
    if (!s || (req.user.role !== 'owner' && s.user_id !== req.user.id)) return res.status(404).json({ error: 'Sale not found' });
    res.json(s);
  } catch (e) { next(e); }
});
module.exports = router;
