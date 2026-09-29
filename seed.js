// Run once after schema.sql:  npm run seed
require('dotenv').config();
const bcrypt = require('bcrypt');
const db = require('./db');
(async () => {
  const users = [['owner', 'Shop Owner', 'owner123', 'owner'], ['cashier', 'Main Cashier', 'cashier123', 'cashier']];
  for (const [u, n, p, r] of users)
    await db.query('INSERT IGNORE INTO users (username, full_name, password_hash, role) VALUES (?,?,?,?)', [u, n, await bcrypt.hash(p, 10), r]);
  const products = [
    ['Inyange Water 500ml', 'Drinks', '6001', 300, 500, 100, 20], ['Fanta 300ml', 'Drinks', '6002', 400, 600, 80, 20],
    ['Coca-Cola 300ml', 'Drinks', '6003', 400, 600, 80, 20], ['Primus Beer 500ml', 'Drinks', '6004', 800, 1200, 60, 12],
    ['Rice 1kg', 'Food', '6005', 1000, 1300, 50, 10], ['Sugar 1kg', 'Food', '6006', 1300, 1600, 40, 10],
    ['Cooking Oil 1L', 'Food', '6007', 2200, 2700, 30, 8], ['Maize Flour 1kg', 'Food', '6008', 900, 1200, 45, 10],
    ['Bread Loaf', 'Food', '6009', 700, 900, 25, 10], ['Eggs (tray of 30)', 'Food', '6010', 4200, 5000, 12, 4],
    ['Bar Soap', 'Household', '6011', 400, 600, 60, 15], ['Toothpaste', 'Household', '6012', 700, 1000, 35, 10],
    ['Matches (box)', 'Household', '6013', 50, 100, 4, 10], ['Airtime Voucher 1000', 'Services', '6014', 950, 1000, 200, 50],
    ['Exercise Book', 'Stationery', '6015', 250, 400, 70, 20],
  ];
  for (const p of products) {
    const [r] = await db.query('INSERT IGNORE INTO products (name, category, barcode, buy_price, sell_price, quantity, min_stock) VALUES (?,?,?,?,?,?,?)', p);
    if (r.insertId) await db.query("INSERT INTO stock_movements (product_id, type, quantity, note) VALUES (?, 'initial', ?, 'Opening stock')", [r.insertId, p[5]]);
  }
  console.log('Seeded. Logins: owner/owner123, cashier/cashier123 (change these!)');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
