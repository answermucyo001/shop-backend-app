const router = require('express').Router();
const db = require('../db');
// Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD, defaults to the last 30 days
function range(q) {
  const to = q.to || new Date().toISOString().slice(0, 10);
  const from = q.from || new Date(Date.now() - 29 * 864e5).toISOString().slice(0, 10);
  return [from + ' 00:00:00', to + ' 23:59:59'];
}
const PROFIT = 'SUM((si.price - si.buy_price) * si.quantity)';

// Sales grouped by day / week / month
router.get('/sales', async (req, res, next) => {
  try {
    const fmt = { daily: '%Y-%m-%d', weekly: '%x-W%v', monthly: '%Y-%m' }[req.query.period] || '%Y-%m-%d';
    const [rows] = await db.query(`SELECT DATE_FORMAT(s.created_at, ?) AS period, COUNT(DISTINCT s.id) AS sales_count,
      SUM(si.price * si.quantity) AS revenue, ${PROFIT} AS profit
      FROM sales s JOIN sale_items si ON si.sale_id = s.id WHERE s.created_at BETWEEN ? AND ?
      GROUP BY period ORDER BY period DESC`, [fmt, ...range(req.query)]);
    res.json(rows);
  } catch (e) { next(e); }
});
router.get('/top-products', async (req, res, next) => {
  try {
    const [rows] = await db.query(`SELECT si.product_name AS name, SUM(si.quantity) AS units, SUM(si.price * si.quantity) AS revenue, ${PROFIT} AS profit
      FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE s.created_at BETWEEN ? AND ?
      GROUP BY si.product_id, si.product_name ORDER BY units DESC LIMIT 10`, range(req.query));
    res.json(rows);
  } catch (e) { next(e); }
});
router.get('/cashiers', async (req, res, next) => {
  try {
    const [rows] = await db.query(`SELECT u.full_name AS cashier, COUNT(DISTINCT s.id) AS sales_count, SUM(si.price * si.quantity) AS revenue, ${PROFIT} AS profit
      FROM sales s JOIN users u ON u.id = s.user_id JOIN sale_items si ON si.sale_id = s.id WHERE s.created_at BETWEEN ? AND ?
      GROUP BY u.id ORDER BY revenue DESC`, range(req.query));
    res.json(rows);
  } catch (e) { next(e); }
});
// Dashboard numbers for today
router.get('/dashboard', async (req, res, next) => {
  try {
    const [[t]] = await db.query(`SELECT COUNT(DISTINCT s.id) AS sales_count, COALESCE(SUM(si.price * si.quantity),0) AS revenue, COALESCE(${PROFIT},0) AS profit
      FROM sales s JOIN sale_items si ON si.sale_id = s.id WHERE DATE(s.created_at) = CURDATE()`);
    const [low] = await db.query('SELECT id, name, quantity, min_stock FROM products WHERE active = 1 AND quantity <= min_stock ORDER BY quantity LIMIT 20');
    res.json({ today: t, low_stock: low });
  } catch (e) { next(e); }
});
module.exports = router;
