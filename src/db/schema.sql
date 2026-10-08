-- ShopSense relational schema (SQLite via node:sqlite).
-- Catalogue, users, implicit feedback, cart, orders, events and search logs.

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
  brand         TEXT,
  category      TEXT,
  price         REAL,
  mrp           REAL,
  currency      TEXT,
  rating        REAL,
  rating_count  INTEGER,
  data          TEXT NOT NULL,           -- full product document (JSON)
  created_at    TEXT,
  updated_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products (category);
CREATE INDEX IF NOT EXISTS idx_products_brand    ON products (brand);
CREATE INDEX IF NOT EXISTS idx_products_price    ON products (price);

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT UNIQUE,
  password_hash TEXT,
  role          TEXT NOT NULL DEFAULT 'user',
  cold_start    INTEGER NOT NULL DEFAULT 0,
  phone         TEXT,
  profession    TEXT,
  preferences   TEXT,                    -- JSON
  created_at    TEXT,
  is_seed       INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS wishlist_items (
  user_id    TEXT NOT NULL,
  product_id TEXT NOT NULL,
  added_at   TEXT,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS interactions (
  id         TEXT PRIMARY KEY,
  user_id    TEXT,
  product_id TEXT,
  type       TEXT,
  ts         TEXT,
  session_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_interactions_user    ON interactions (user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_product ON interactions (product_id);

CREATE TABLE IF NOT EXISTS cart_items (
  user_id    TEXT NOT NULL,
  product_id TEXT NOT NULL,
  quantity   INTEGER NOT NULL DEFAULT 1,
  added_at   TEXT,
  PRIMARY KEY (user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'pending',
  total      REAL NOT NULL DEFAULT 0,
  currency   TEXT NOT NULL DEFAULT 'INR',
  item_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders (user_id);

CREATE TABLE IF NOT EXISTS order_items (
  order_id   TEXT NOT NULL,
  product_id TEXT NOT NULL,
  title      TEXT,
  price      REAL,
  quantity   INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (order_id, product_id),
  FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT,
  product_id TEXT,
  type       TEXT,
  session_id TEXT,
  ts         TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_product ON events (product_id);
CREATE INDEX IF NOT EXISTS idx_events_user    ON events (user_id);

CREATE TABLE IF NOT EXISTS search_logs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  query      TEXT,
  total      INTEGER,
  clicked_id TEXT,
  ts         TEXT
);

CREATE TABLE IF NOT EXISTS search_history (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  query   TEXT NOT NULL,
  total   INTEGER,
  ts      TEXT
);
CREATE INDEX IF NOT EXISTS idx_search_history_user ON search_history (user_id);
