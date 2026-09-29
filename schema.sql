CREATE DATABASE IF NOT EXISTS shop_inventory CHARACTER SET utf8mb4;
USE shop_inventory;
CREATE TABLE users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  username VARCHAR(50) NOT NULL UNIQUE,
  full_name VARCHAR(100) NOT NULL,
  password_hash VARCHAR(100) NOT NULL,
  role ENUM('owner','cashier') NOT NULL DEFAULT 'cashier',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  category VARCHAR(80) NOT NULL DEFAULT 'General',
  barcode VARCHAR(50) NULL UNIQUE,
  buy_price DECIMAL(12,2) NOT NULL CHECK (buy_price >= 0),
  sell_price DECIMAL(12,2) NOT NULL CHECK (sell_price >= 0),
  quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  min_stock INT NOT NULL DEFAULT 5 CHECK (min_stock >= 0),
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name), INDEX idx_category (category)
);
CREATE TABLE sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  receipt_no VARCHAR(30) NOT NULL UNIQUE,
  user_id INT NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  amount_paid DECIMAL(12,2) NOT NULL,
  change_given DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method ENUM('cash','mtn_momo','airtel_money','credit') NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sales_created (created_at), INDEX idx_sales_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE TABLE sale_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  product_id INT NOT NULL,
  product_name VARCHAR(150) NOT NULL,
  quantity INT NOT NULL CHECK (quantity > 0),
  price DECIMAL(12,2) NOT NULL,      -- selling price at time of sale
  buy_price DECIMAL(12,2) NOT NULL,  -- buying price at time of sale
  INDEX idx_items_sale (sale_id), INDEX idx_items_product (product_id),
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id)
);
CREATE TABLE stock_movements (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  type ENUM('sale','restock','adjustment','initial') NOT NULL,
  quantity INT NOT NULL,             -- signed: negative = stock out
  note VARCHAR(255) NULL,
  user_id INT NULL,
  sale_id INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_mov_product (product_id), INDEX idx_mov_created (created_at),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
