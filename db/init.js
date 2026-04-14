const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'milanorte.db');
const db = new Database(dbPath);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create schema
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT NOT NULL,
    customer_phone TEXT NOT NULL,
    customer_email TEXT,
    customer_address TEXT NOT NULL,
    delivery_day TEXT NOT NULL CHECK(delivery_day IN ('miercoles', 'sabado')),
    items_json TEXT NOT NULL,
    total_amount REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK(status IN ('pending','paid','preparing','ready','delivered','cancelled')),
    mp_preference_id TEXT,
    mp_payment_id TEXT,
    mp_status TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now', 'localtime')),
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
  CREATE INDEX IF NOT EXISTS idx_orders_delivery ON orders(delivery_day);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('price_nalga', '28000');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('price_pollo', '28000');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('price_bife_chorizo', '28000');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('price_peceto', '28000');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('shipping_rate_per_km', '250');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('free_shipping_threshold', '150000');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('whatsapp_verification_enabled', '0');

  CREATE TABLE IF NOT EXISTS phone_verifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    phone TEXT NOT NULL,
    code TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now', 'localtime'))
  );

  CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone ON phone_verifications(phone);
`);

// Migrations: add new columns (try/catch for idempotency)
const migrations = [
  'ALTER TABLE orders ADD COLUMN delivery_slot TEXT',
  'ALTER TABLE orders ADD COLUMN shipping_cost REAL DEFAULT 0',
  'ALTER TABLE orders ADD COLUMN shipping_distance_km REAL DEFAULT 0',
  'ALTER TABLE orders ADD COLUMN customer_lat REAL',
  'ALTER TABLE orders ADD COLUMN customer_lng REAL',
  'ALTER TABLE orders ADD COLUMN address_extra TEXT',
  'ALTER TABLE orders ADD COLUMN delivery_date TEXT',
];
for (const sql of migrations) {
  try { db.exec(sql); } catch (e) { /* column already exists */ }
}

// Settings helpers
const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSetting = db.prepare(`
  INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now', 'localtime'))
`);
const getAllSettings = db.prepare('SELECT * FROM settings');

// Helpers
const createOrder = db.prepare(`
  INSERT INTO orders (customer_name, customer_phone, customer_email, customer_address, address_extra, delivery_day, delivery_slot, delivery_date, items_json, total_amount, shipping_cost, shipping_distance_km, customer_lat, customer_lng)
  VALUES (@customer_name, @customer_phone, @customer_email, @customer_address, @address_extra, @delivery_day, @delivery_slot, @delivery_date, @items_json, @total_amount, @shipping_cost, @shipping_distance_km, @customer_lat, @customer_lng)
`);

const getOrder = db.prepare('SELECT * FROM orders WHERE id = ?');

const updateOrderPayment = db.prepare(`
  UPDATE orders SET mp_preference_id = @mp_preference_id, updated_at = datetime('now', 'localtime')
  WHERE id = @id
`);

const updateOrderStatus = db.prepare(`
  UPDATE orders SET status = @status, updated_at = datetime('now', 'localtime')
  WHERE id = @id
`);

const updateOrderFromWebhook = db.prepare(`
  UPDATE orders SET mp_payment_id = @mp_payment_id, mp_status = @mp_status, status = @status, updated_at = datetime('now', 'localtime')
  WHERE id = @id
`);

const updateOrderPaymentFromRedirect = db.prepare(`
  UPDATE orders SET mp_payment_id = @mp_payment_id, mp_status = @mp_status, status = @status, updated_at = datetime('now', 'localtime')
  WHERE id = @id AND (mp_payment_id IS NULL OR mp_payment_id = '')
`);

// Phone verification helpers
const findOrderByPhone = db.prepare('SELECT id FROM orders WHERE customer_phone = ? LIMIT 1');

const createVerification = db.prepare(`
  INSERT INTO phone_verifications (phone, code, expires_at)
  VALUES (@phone, @code, datetime('now', 'localtime', '+10 minutes'))
`);

const getActiveVerification = db.prepare(`
  SELECT * FROM phone_verifications
  WHERE phone = ? AND verified = 0 AND expires_at > datetime('now', 'localtime')
  ORDER BY created_at DESC LIMIT 1
`);

const markPhoneVerified = db.prepare(`
  UPDATE phone_verifications SET verified = 1 WHERE phone = ? AND code = ?
`);

const isPhoneVerified = db.prepare(`
  SELECT id FROM phone_verifications WHERE phone = ? AND verified = 1 LIMIT 1
`);

const listOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC');

const listOrdersByStatus = db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY created_at DESC');

const listOrdersByDelivery = db.prepare('SELECT * FROM orders WHERE delivery_day = ? ORDER BY created_at DESC');

module.exports = {
  db,
  getSetting,
  setSetting,
  getAllSettings,
  createOrder,
  getOrder,
  updateOrderPayment,
  updateOrderStatus,
  updateOrderFromWebhook,
  updateOrderPaymentFromRedirect,
  listOrders,
  listOrdersByStatus,
  listOrdersByDelivery,
  findOrderByPhone,
  createVerification,
  getActiveVerification,
  markPhoneVerified,
  isPhoneVerified
};
