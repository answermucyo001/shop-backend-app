require('dotenv').config();
const mysql = require('mysql2/promise');
// One shared connection pool. decimalNumbers returns DECIMAL as JS numbers.
module.exports = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shop_inventory',
  waitForConnections: true, connectionLimit: 10, decimalNumbers: true,
});
