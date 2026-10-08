"use strict";
/**
 * SQLite persistence layer (node:sqlite, zero runtime dependencies).
 *
 * The JSON seed files remain the bootstrap source of truth: on first run the
 * database is created from them, after which the database is canonical. The
 * search/recommendation engines still load their datasets into memory for
 * speed, but every mutation flows through this module so state survives
 * restarts.
 */
const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");
const { hashPassword } = require("../auth/auth");
const { recategorize } = require("../catalog/categories");

const DATA_DIR = path.join(__dirname, "..", "..", "data");
const DB_FILE = process.env.SHOPSENSE_DB || path.join(DATA_DIR, "shopsense.db");
const SCHEMA_FILE = path.join(__dirname, "schema.sql");

const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const INTERACTIONS_FILE = path.join(DATA_DIR, "interactions.json");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const EXTRA_FILE = path.join(DATA_DIR, "extra-products.json");

const DEMO_PASSWORD = "password123";
const ADMIN_EMAIL = "admin@shopsense.dev";
const ADMIN_PASSWORD = "admin123";

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/** Generate the JSON seed files if they are missing (mirrors scripts/*). */
function ensureSeedFiles() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const missing = [PRODUCTS_FILE, INTERACTIONS_FILE, USERS_FILE].some((f) => !fs.existsSync(f));
  if (missing) {
    const { generateCatalog } = require("../../scripts/generate-catalog");
    const { generate } = require("../../scripts/generate-interactions");
    if (!fs.existsSync(PRODUCTS_FILE)) {
      fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(generateCatalog(), null, 2));
    }
    if (!fs.existsSync(INTERACTIONS_FILE) || !fs.existsSync(USERS_FILE)) {
      const { users, interactions } = generate();
      fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
      fs.writeFileSync(INTERACTIONS_FILE, JSON.stringify(interactions, null, 2));
    }
  }
  // Supplemental well-known-brand catalogue (merged into the products table).
  if (!fs.existsSync(EXTRA_FILE)) {
    const { generateExtra } = require("../../scripts/generate-extra");
    fs.writeFileSync(EXTRA_FILE, JSON.stringify(generateExtra(), null, 2));
  }
}

function verticalOf(p) {
  return (p.categoryPath && p.categoryPath[0]) || p.category || "Other";
}

/** Index the real product photos we already have, by category and vertical. */
function buildImagePools(products) {
  const byCategory = new Map();
  const byVertical = new Map();
  const all = [];
  for (const p of products) {
    if (typeof p.image !== "string" || !p.image) continue;
    all.push(p.image);
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category).push(p.image);
    const v = verticalOf(p);
    if (!byVertical.has(v)) byVertical.set(v, []);
    byVertical.get(v).push(p.image);
  }
  return { byCategory, byVertical, all };
}

/**
 * Give products without a photo a real product image drawn from the catalogue
 * pool (category match first, then vertical, then any), spread round-robin so
 * images aren't all identical.
 * @returns {number} how many products were assigned an image
 */
function assignImages(products, existing) {
  const { byCategory, byVertical, all } = buildImagePools(existing);
  if (!all.length) return 0;
  const cursor = new Map();
  const take = (arr, key) => {
    const i = cursor.get(key) || 0;
    cursor.set(key, i + 1);
    return arr[i % arr.length];
  };
  let assigned = 0;
  let fallback = 0;
  for (const p of products) {
    if (typeof p.image === "string" && p.image) continue;
    const cat = byCategory.get(p.category);
    const vert = byVertical.get(verticalOf(p));
    if (cat && cat.length) p.image = take(cat, `c:${p.category}`);
    else if (vert && vert.length) p.image = take(vert, `v:${verticalOf(p)}`);
    else p.image = all[fallback++ % all.length];
    p.images = [p.image];
    assigned++;
  }
  return assigned;
}

/** Insert any supplemental branded products that are not already present. */
function mergeExtraProducts(db) {
  if (!fs.existsSync(EXTRA_FILE)) return;
  const existing = loadProducts(db);
  const ids = new Set(existing.map((p) => p.id));
  const keys = new Set(existing.map((p) => `${brandKey(p)}|${titleKey(p)}`));
  const extra = dedupeAndNormalize(readJSON(EXTRA_FILE)).products;
  const toAdd = [];
  for (const p of extra) {
    const key = `${brandKey(p)}|${titleKey(p)}`;
    if (ids.has(p.id) || keys.has(key)) continue;
    ids.add(p.id);
    keys.add(key);
    toAdd.push(p);
  }
  if (!toAdd.length) return;
  const withImages = (existing || []).filter((p) => typeof p.image === "string" && p.image);
  assignImages(toAdd, withImages);
  insertProducts(db, toAdd);
}

/** Backfill photos for already-stored products that have none. */
function backfillImages(db) {
  const products = loadProducts(db);
  const without = products.filter((p) => typeof p.image !== "string" || !p.image);
  if (!without.length) return;
  const assigned = assignImages(without, products);
  if (!assigned) return;
  for (const p of without) repoProductSave(db, p);
}

/** Minimal single-product upsert used by maintenance tasks. */
function repoProductSave(db, p) {
  db.prepare(
    `INSERT INTO products
      (id, title, brand, category, price, mrp, currency, rating, rating_count, data, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at`
  ).run(...productParams(p, new Date().toISOString()));
}

function countOf(db, table) {
  return db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

/* -------------------------------------------------- catalogue normalisation */

function titleKey(p) {
  return String(p.title || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function brandKey(p) {
  return String(p.brand || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A rough completeness score used to pick the best copy of a duplicate. */
function quality(p) {
  return (
    (p.image ? 1 : 0) +
    Math.min((p.ratingCount || 0) / 1000, 5) +
    (Array.isArray(p.offers) ? p.offers.length / 10 : 0) +
    Math.min(String(p.description || "").length / 1000, 1)
  );
}

/**
 * Remove duplicate products (same id, or same brand + normalized title) and fix
 * their categoryPath. Returns the cleaned list plus whether anything changed.
 */
function dedupeAndNormalize(products) {
  const byId = new Set();
  const byKey = new Map();
  let changed = false;
  const dropped = [];

  for (const p of products) {
    if (byId.has(p.id)) {
      dropped.push(p.id);
      changed = true;
      continue;
    }
    byId.add(p.id);
    const key = `${brandKey(p)}|${titleKey(p)}` || p.id;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, p);
    } else {
      changed = true;
      if (quality(p) > quality(prev)) {
        dropped.push(prev.id);
        byKey.set(key, p);
      } else {
        dropped.push(p.id);
      }
    }
  }

  const out = [];
  for (const p of byKey.values()) {
    if (recategorize(p)) changed = true;
    out.push(p);
  }
  return { products: out, changed, dropped };
}

/** Rewrite the products table if it holds duplicates or stale categories. */
function normalizeCatalog(db) {
  const rows = db.prepare("SELECT data FROM products ORDER BY rowid").all();
  if (!rows.length) return;
  const { products, changed } = dedupeAndNormalize(rows.map((r) => JSON.parse(r.data)));
  if (!changed) return;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.exec("DELETE FROM products");
    insertProducts(db, products);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function productParams(p, now) {
  return [
    p.id,
    p.title,
    p.brand || null,
    p.category || null,
    p.price == null ? null : p.price,
    p.mrp == null ? null : p.mrp,
    p.currency || null,
    p.rating == null ? null : p.rating,
    p.ratingCount == null ? null : p.ratingCount,
    JSON.stringify(p),
    now,
    now,
  ];
}

const PRODUCT_INSERT = `INSERT OR IGNORE INTO products
  (id, title, brand, category, price, mrp, currency, rating, rating_count, data, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;

function insertProducts(db, products) {
  const stmt = db.prepare(PRODUCT_INSERT);
  const now = new Date().toISOString();
  for (const p of products) stmt.run(...productParams(p, now));
}

function insertUsers(db, users) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO users
    (id, name, email, password_hash, role, cold_start, phone, profession, preferences, created_at, is_seed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const u of users) {
    stmt.run(
      u.id,
      u.name,
      u.email || null,
      u.passwordHash || null,
      u.role || "user",
      u.coldStart ? 1 : 0,
      u.phone || null,
      u.profession || null,
      u.preferences ? JSON.stringify(u.preferences) : null,
      u.createdAt || new Date().toISOString(),
      u.isSeed ? 1 : 0
    );
  }
}

function insertInteractions(db, interactions) {
  const stmt = db.prepare(`INSERT OR IGNORE INTO interactions
    (id, user_id, product_id, type, ts, session_id) VALUES (?, ?, ?, ?, ?, ?)`);
  for (const ev of interactions) {
    stmt.run(ev.id, ev.userId || null, ev.productId || null, ev.type || null, ev.ts || null, ev.sessionId || null);
  }
}

function seedDatabase(db) {
  const hasProducts = countOf(db, "products") > 0;
  const hasUsers = countOf(db, "users") > 0;
  const hasInteractions = countOf(db, "interactions") > 0;
  const hasAdmin = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n > 0;
  if (hasProducts && hasUsers && hasInteractions && hasAdmin) return;

  ensureSeedFiles();

  const products = hasProducts ? null : dedupeAndNormalize(readJSON(PRODUCTS_FILE)).products;
  const users = hasUsers
    ? null
    : readJSON(USERS_FILE).map((u) => ({
        ...u,
        email: `${u.id}@shopsense.dev`,
        passwordHash: hashPassword(DEMO_PASSWORD),
        role: "user",
        isSeed: true,
      }));
  const interactions = hasInteractions ? null : readJSON(INTERACTIONS_FILE);

  db.exec("BEGIN IMMEDIATE");
  try {
    if (products && countOf(db, "products") === 0) insertProducts(db, products);
    if (users && countOf(db, "users") === 0) insertUsers(db, users);
    if (interactions && countOf(db, "interactions") === 0) insertInteractions(db, interactions);
    if (!hasAdmin && db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n === 0) {
      insertUsers(db, [
        {
          id: "admin",
          name: "ShopSense Admin",
          email: ADMIN_EMAIL,
          passwordHash: hashPassword(ADMIN_PASSWORD),
          role: "admin",
          coldStart: true,
          preferences: null,
          createdAt: new Date().toISOString(),
        },
      ]);
    }
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Run a DB operation, retrying briefly on SQLITE_BUSY (multi-process startup). */
function withRetry(fn, tries = 12) {
  let lastErr;
  for (let i = 0; i < tries; i++) {
    try {
      return fn();
    } catch (err) {
      lastErr = err;
      if (err.errcode !== 5 && !/locked|busy/i.test(err.message || "")) throw err;
      sleepSync(25 * (i + 1));
    }
  }
  throw lastErr;
}

/** Add columns that newer versions expect to databases created earlier. */
function migrate(db) {
  const cols = db.prepare("PRAGMA table_info(users)").all().map((c) => c.name);
  const addColumn = (name, ddl) => {
    if (!cols.includes(name)) withRetry(() => db.exec(`ALTER TABLE users ADD COLUMN ${ddl}`));
  };
  addColumn("phone", "phone TEXT");
  addColumn("profession", "profession TEXT");
  addColumn("is_seed", "is_seed INTEGER NOT NULL DEFAULT 0");
  // Backfill: pre-existing generated demo accounts are flagged as seed data.
  withRetry(() =>
    db.exec("UPDATE users SET is_seed = 1 WHERE is_seed = 0 AND role = 'user' AND email LIKE '%@shopsense.dev'")
  );
}

/** Open (creating if needed) the ShopSense database. */
function openDatabase({ file = DB_FILE, seed = true } = {}) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  // busy_timeout must be set first so concurrent starters wait instead of failing.
  db.exec("PRAGMA busy_timeout = 5000;");
  withRetry(() => db.exec("PRAGMA journal_mode = WAL;"));
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(fs.readFileSync(SCHEMA_FILE, "utf8"));
  migrate(db);
  if (seed) withRetry(() => seedDatabase(db));
  withRetry(() => normalizeCatalog(db));
  withRetry(() => mergeExtraProducts(db));
  withRetry(() => backfillImages(db));
  return db;
}

/* ------------------------------------------------------------------ loads */

function loadProducts(db) {
  return db
    .prepare("SELECT data FROM products ORDER BY rowid")
    .all()
    .map((r) => JSON.parse(r.data));
}

function loadUsers(db) {
  return db
    .prepare("SELECT * FROM users ORDER BY rowid")
    .all()
    .map((row) => {
      let preferences = null;
      try {
        preferences = row.preferences ? JSON.parse(row.preferences) : null;
      } catch {
        preferences = null;
      }
      return {
        id: row.id,
        name: row.name,
        email: row.email || null,
        role: row.role || "user",
        phone: row.phone || null,
        profession: row.profession || null,
        preferences,
        coldStart: !!row.cold_start,
        isSeed: !!row.is_seed,
        createdAt: row.created_at || null,
      };
    });
}

function loadInteractions(db) {
  return db
    .prepare("SELECT id, user_id, product_id, type, ts, session_id FROM interactions ORDER BY rowid")
    .all()
    .map((r) => ({
      id: r.id,
      userId: r.user_id,
      productId: r.product_id,
      type: r.type,
      ts: r.ts,
      sessionId: r.session_id,
    }));
}

/* --------------------------------------------------------------- repository */

/** Build the repository bound to a database handle. */
function createRepo(db) {
  const saveProduct = (product) => {
    const now = new Date().toISOString();
    db.prepare(
      `INSERT INTO products
        (id, title, brand, category, price, mrp, currency, rating, rating_count, data, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         title = excluded.title,
         brand = excluded.brand,
         category = excluded.category,
         price = excluded.price,
         mrp = excluded.mrp,
         currency = excluded.currency,
         rating = excluded.rating,
         rating_count = excluded.rating_count,
         data = excluded.data,
         updated_at = excluded.updated_at`
    ).run(...productParams(product, now));
    return product;
  };

  return {
    raw: db,

    products: {
      count: () => countOf(db, "products"),
      all: () => loadProducts(db),
      get(id) {
        const row = db.prepare("SELECT data FROM products WHERE id = ?").get(id);
        return row ? JSON.parse(row.data) : null;
      },
      save: saveProduct,
      remove(id) {
        return db.prepare("DELETE FROM products WHERE id = ?").run(id).changes > 0;
      },
      saveMany(products) {
        db.exec("BEGIN IMMEDIATE");
        try {
          for (const p of products) saveProduct(p);
          db.exec("COMMIT");
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
        return products.length;
      },
    },

    users: {
      count: () => countOf(db, "users"),
      get(id) {
        return db.prepare("SELECT * FROM users WHERE id = ?").get(id) || null;
      },
      getByEmail(email) {
        return db.prepare("SELECT * FROM users WHERE lower(email) = lower(?)").get(email) || null;
      },
      insert(user) {
        db.prepare(
          `INSERT INTO users (id, name, email, password_hash, role, cold_start, phone, profession, preferences, created_at, is_seed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          user.id,
          user.name,
          user.email || null,
          user.passwordHash || null,
          user.role || "user",
          user.coldStart ? 1 : 0,
          user.phone || null,
          user.profession || null,
          user.preferences ? JSON.stringify(user.preferences) : null,
          user.createdAt || new Date().toISOString(),
          user.isSeed ? 1 : 0
        );
        return this.get(user.id);
      },
      all() {
        return db.prepare("SELECT * FROM users ORDER BY rowid").all();
      },
      /** Registered customers only (excludes generated demo/seed accounts). */
      listReal() {
        return db
          .prepare("SELECT * FROM users WHERE is_seed = 0 AND role = 'user' ORDER BY created_at DESC")
          .all();
      },
      realCount() {
        return db.prepare("SELECT COUNT(*) AS n FROM users WHERE is_seed = 0 AND role = 'user'").get().n;
      },
    },

    wishlist: {
      list(userId) {
        return db
          .prepare("SELECT product_id AS productId, added_at AS addedAt FROM wishlist_items WHERE user_id = ? ORDER BY added_at DESC")
          .all(userId);
      },
      ids(userId) {
        return db.prepare("SELECT product_id FROM wishlist_items WHERE user_id = ?").all(userId).map((r) => r.product_id);
      },
      has(userId, productId) {
        return !!db.prepare("SELECT 1 AS x FROM wishlist_items WHERE user_id = ? AND product_id = ?").get(userId, productId);
      },
      add(userId, productId) {
        db.prepare(
          "INSERT OR IGNORE INTO wishlist_items (user_id, product_id, added_at) VALUES (?, ?, ?)"
        ).run(userId, productId, new Date().toISOString());
        return this.has(userId, productId);
      },
      remove(userId, productId) {
        return db.prepare("DELETE FROM wishlist_items WHERE user_id = ? AND product_id = ?").run(userId, productId).changes > 0;
      },
      count(userId) {
        return db.prepare("SELECT COUNT(*) AS n FROM wishlist_items WHERE user_id = ?").get(userId).n;
      },
    },

    interactions: {
      count: () => countOf(db, "interactions"),
      all: () => loadInteractions(db),
      insert(ev) {
        db.prepare(
          `INSERT INTO interactions (id, user_id, product_id, type, ts, session_id)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).run(
          ev.id || `i_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          ev.userId || null,
          ev.productId || null,
          ev.type || "view",
          ev.ts || new Date().toISOString(),
          ev.sessionId || null
        );
      },
    },

    cart: {
      list(userId) {
        return db
          .prepare("SELECT product_id AS productId, quantity, added_at AS addedAt FROM cart_items WHERE user_id = ? ORDER BY added_at")
          .all(userId);
      },
      add(userId, productId, quantity = 1) {
        db.prepare(
          `INSERT INTO cart_items (user_id, product_id, quantity, added_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(user_id, product_id) DO UPDATE SET quantity = quantity + excluded.quantity`
        ).run(userId, productId, quantity, new Date().toISOString());
        return db.prepare("SELECT quantity FROM cart_items WHERE user_id = ? AND product_id = ?").get(userId, productId).quantity;
      },
      setQuantity(userId, productId, quantity) {
        return db
          .prepare("UPDATE cart_items SET quantity = ? WHERE user_id = ? AND product_id = ?")
          .run(quantity, userId, productId).changes > 0;
      },
      remove(userId, productId) {
        return db.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?").run(userId, productId).changes > 0;
      },
      clear(userId) {
        return db.prepare("DELETE FROM cart_items WHERE user_id = ?").run(userId).changes;
      },
      count(userId) {
        return db.prepare("SELECT COALESCE(SUM(quantity), 0) AS n FROM cart_items WHERE user_id = ?").get(userId).n;
      },
    },

    orders: {
      create(order, items) {
        db.exec("BEGIN IMMEDIATE");
        try {
          db.prepare(
            `INSERT INTO orders (id, user_id, status, total, currency, item_count, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          ).run(order.id, order.userId, order.status || "pending", order.total, order.currency || "INR", order.itemCount, order.createdAt);
          const stmt = db.prepare(
            "INSERT INTO order_items (order_id, product_id, title, price, quantity) VALUES (?, ?, ?, ?, ?)"
          );
          for (const it of items) stmt.run(order.id, it.productId, it.title || null, it.price, it.quantity);
          db.exec("COMMIT");
        } catch (err) {
          db.exec("ROLLBACK");
          throw err;
        }
        return order.id;
      },
      get(id) {
        return db.prepare("SELECT * FROM orders WHERE id = ?").get(id) || null;
      },
      items(orderId) {
        return db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(orderId);
      },
      listByUser(userId) {
        return db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(userId);
      },
      listAll(limit = 100) {
        return db.prepare("SELECT * FROM orders ORDER BY created_at DESC LIMIT ?").all(limit);
      },
      updateStatus(id, status) {
        return db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id).changes > 0;
      },
    },

    events: {
      insert(ev) {
        db.prepare("INSERT INTO events (user_id, product_id, type, session_id, ts) VALUES (?, ?, ?, ?, ?)").run(
          ev.userId || null,
          ev.productId || null,
          ev.type || "view",
          ev.sessionId || null,
          ev.ts || new Date().toISOString()
        );
      },
      count: () => countOf(db, "events"),
      popularProducts(limit = 10) {
        return db
          .prepare(
            `SELECT product_id AS productId, COUNT(*) AS count
             FROM events WHERE product_id IS NOT NULL
             GROUP BY product_id ORDER BY count DESC LIMIT ?`
          )
          .all(limit);
      },
    },

    searchLogs: {
      insert(log) {
        db.prepare("INSERT INTO search_logs (query, total, clicked_id, ts) VALUES (?, ?, ?, ?)").run(
          log.query || "",
          log.total == null ? null : log.total,
          log.clickedId || null,
          log.ts || new Date().toISOString()
        );
      },
      count: () => countOf(db, "search_logs"),
      zeroResultCount() {
        return db.prepare("SELECT COUNT(*) AS n FROM search_logs WHERE total = 0").get().n;
      },
      topQueries(limit = 10) {
        return db
          .prepare(
            `SELECT query, COUNT(*) AS count FROM search_logs
             WHERE query != '' GROUP BY query ORDER BY count DESC LIMIT ?`
          )
          .all(limit);
      },
    },

    searchHistory: {
      add(userId, query, total) {
        db.prepare("INSERT INTO search_history (user_id, query, total, ts) VALUES (?, ?, ?, ?)").run(
          userId,
          query || "",
          total == null ? null : total,
          new Date().toISOString()
        );
      },
      /** Most recent distinct queries for a user (newest first). */
      recent(userId, limit = 10) {
        const rows = db
          .prepare("SELECT query, ts FROM search_history WHERE user_id = ? ORDER BY id DESC LIMIT ?")
          .all(userId, limit * 4);
        const seen = new Set();
        const out = [];
        for (const r of rows) {
          const q = (r.query || "").trim();
          if (!q || seen.has(q.toLowerCase())) continue;
          seen.add(q.toLowerCase());
          out.push({ query: q, ts: r.ts });
          if (out.length >= limit) break;
        }
        return out;
      },
      count(userId) {
        return db.prepare("SELECT COUNT(*) AS n FROM search_history WHERE user_id = ?").get(userId).n;
      },
    },
  };
}

module.exports = {
  openDatabase,
  createRepo,
  loadProducts,
  loadUsers,
  loadInteractions,
  dedupeAndNormalize,
  ensureSeedFiles,
  DB_FILE,
  DATA_DIR,
  DEMO_PASSWORD,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
};
