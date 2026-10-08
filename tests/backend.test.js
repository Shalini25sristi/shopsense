"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createStore } = require("../src/store/store");
const { handleApi } = require("../src/api/routes");
const { dedupeAndNormalize } = require("../src/db/database");

// Isolated in-memory database so this suite never touches the dev database.
const store = createStore({ dbFile: ":memory:" });

function mockRes() {
  const res = { status: 0, headers: {}, body: "" };
  res.writeHead = (status, headers) => {
    res.status = status;
    res.headers = headers || {};
  };
  res.end = (body) => {
    res.body = body || "";
  };
  return res;
}

function mockReq(method, { token, body } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const req = {
    method,
    headers,
    on(event, cb) {
      if (event === "data" && body !== undefined) cb(Buffer.from(JSON.stringify(body)));
      if (event === "end") cb();
      return req;
    },
  };
  return req;
}

async function call(method, path, opts = {}) {
  const res = mockRes();
  await handleApi(mockReq(method, opts), res, new URL("http://localhost" + path), store);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

const productId = store.products[0].id;

test("register creates a user and returns a token", async () => {
  const r = await call("POST", "/api/auth/register", {
    body: { name: "Test User", email: "test.user@example.com", password: "secret123" },
  });
  assert.equal(r.status, 201);
  assert.ok(r.json.token);
  assert.equal(r.json.user.email, "test.user@example.com");
  assert.equal(r.json.user.role, "user");
  assert.ok(!("password_hash" in r.json.user));
});

test("register rejects duplicate email and weak password", async () => {
  const dup = await call("POST", "/api/auth/register", {
    body: { name: "Test User", email: "test.user@example.com", password: "secret123" },
  });
  assert.equal(dup.status, 409);
  const weak = await call("POST", "/api/auth/register", {
    body: { name: "Weak", email: "weak@example.com", password: "123" },
  });
  assert.equal(weak.status, 400);
});

test("login works for a seeded demo user and rejects a bad password", async () => {
  const ok = await call("POST", "/api/auth/login", { body: { email: "u_1@shopsense.dev", password: "password123" } });
  assert.equal(ok.status, 200);
  assert.ok(ok.json.token);
  const bad = await call("POST", "/api/auth/login", { body: { email: "u_1@shopsense.dev", password: "nope" } });
  assert.equal(bad.status, 401);
});

test("/api/auth/me requires and honours a bearer token", async () => {
  assert.equal((await call("GET", "/api/auth/me")).status, 401);
  const login = await call("POST", "/api/auth/login", { body: { email: "u_1@shopsense.dev", password: "password123" } });
  const me = await call("GET", "/api/auth/me", { token: login.json.token });
  assert.equal(me.status, 200);
  assert.equal(me.json.user.id, "u_1");
});

test("cart requires authentication", async () => {
  assert.equal((await call("GET", "/api/cart")).status, 401);
});

test("cart add / update / remove / clear", async () => {
  const login = await call("POST", "/api/auth/login", { body: { email: "u_2@shopsense.dev", password: "password123" } });
  const token = login.json.token;

  const added = await call("POST", "/api/cart", { token, body: { productId, quantity: 1 } });
  assert.equal(added.status, 201);
  assert.equal(added.json.itemCount, 1);
  assert.equal(added.json.items[0].product.id, productId);

  const bumped = await call("PATCH", `/api/cart/${productId}`, { token, body: { quantity: 3 } });
  assert.equal(bumped.json.items[0].quantity, 3);
  assert.equal(bumped.json.itemCount, 3);
  assert.ok(bumped.json.subtotal > 0);

  const removed = await call("DELETE", `/api/cart/${productId}`, { token });
  assert.equal(removed.json.itemCount, 0);

  await call("POST", "/api/cart", { token, body: { productId, quantity: 2 } });
  const cleared = await call("DELETE", "/api/cart", { token });
  assert.equal(cleared.json.itemCount, 0);
});

test("checkout creates an order, clears the cart and records purchases", async () => {
  const login = await call("POST", "/api/auth/login", { body: { email: "u_3@shopsense.dev", password: "password123" } });
  const token = login.json.token;
  await call("POST", "/api/cart", { token, body: { productId, quantity: 2 } });

  const before = store.repo.interactions.count();
  const order = await call("POST", "/api/orders", { token });
  assert.equal(order.status, 201);
  assert.equal(order.json.order.itemCount, 2);
  assert.ok(order.json.order.total > 0);
  assert.equal(store.repo.interactions.count(), before + 1);

  const cart = await call("GET", "/api/cart", { token });
  assert.equal(cart.json.itemCount, 0);

  const list = await call("GET", "/api/orders", { token });
  assert.equal(list.json.orders.length, 1);
  const detail = await call("GET", `/api/orders/${order.json.order.id}`, { token });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.order.id, order.json.order.id);
});

test("checkout with an empty cart is rejected", async () => {
  const login = await call("POST", "/api/auth/login", { body: { email: "u_4@shopsense.dev", password: "password123" } });
  const empty = await call("POST", "/api/orders", { token: login.json.token });
  assert.equal(empty.status, 400);
});

test("admin routes reject regular users", async () => {
  const login = await call("POST", "/api/auth/login", { body: { email: "u_5@shopsense.dev", password: "password123" } });
  const r = await call("GET", "/api/admin/analytics", { token: login.json.token });
  assert.equal(r.status, 403);
  assert.equal((await call("GET", "/api/admin/analytics")).status, 401);
});

test("admin can create, update and delete a product", async () => {
  const login = await call("POST", "/api/auth/login", { body: { email: "admin@shopsense.dev", password: "admin123" } });
  const token = login.json.token;

  const created = await call("POST", "/api/admin/products", {
    token,
    body: { title: "Admin Test Widget", price: 999, brand: "Acme", category: "Gadgets" },
  });
  assert.equal(created.status, 201);
  const newId = created.json.product.id;

  const detail = await call("GET", `/api/products/${newId}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.json.product.title, "Admin Test Widget");

  const updated = await call("PUT", `/api/admin/products/${newId}`, { token, body: { price: 1499 } });
  assert.equal(updated.json.product.price, 1499);

  const removed = await call("DELETE", `/api/admin/products/${newId}`, { token });
  assert.equal(removed.status, 200);
  assert.equal((await call("GET", `/api/products/${newId}`)).status, 404);
});

test("admin analytics reports catalogue and order data", async () => {
  const login = await call("POST", "/api/auth/login", { body: { email: "admin@shopsense.dev", password: "admin123" } });
  const r = await call("GET", "/api/admin/analytics", { token: login.json.token });
  assert.equal(r.status, 200);
  assert.ok(r.json.catalogue.products > 0);
  assert.ok(r.json.users > 0);
});

test("admin product create validates required fields", async () => {
  const login = await call("POST", "/api/auth/login", { body: { email: "admin@shopsense.dev", password: "admin123" } });
  const r = await call("POST", "/api/admin/products", { token: login.json.token, body: { price: 10 } });
  assert.equal(r.status, 400);
});

test("register stores optional phone and profession", async () => {
  const r = await call("POST", "/api/auth/register", {
    body: { name: "Profile User", email: "profile.user@example.com", password: "secret123", phone: "+91 98765 43210", profession: "Designer" },
  });
  assert.equal(r.status, 201);
  assert.equal(r.json.user.phone, "+91 98765 43210");
  assert.equal(r.json.user.profession, "Designer");
});

test("wishlist requires auth and persists per user", async () => {
  assert.equal((await call("GET", "/api/wishlist")).status, 401);
  const login = await call("POST", "/api/auth/login", { body: { email: "u_2@shopsense.dev", password: "password123" } });
  const token = login.json.token;

  const add = await call("POST", "/api/wishlist", { token, body: { productId } });
  assert.equal(add.status, 201);
  assert.ok(add.json.ids.includes(productId));

  const list = await call("GET", "/api/wishlist", { token });
  assert.equal(list.status, 200);
  assert.ok(list.json.items.some((p) => p.id === productId));

  const del = await call("DELETE", `/api/wishlist/${productId}`, { token });
  assert.equal(del.status, 200);
  assert.ok(!del.json.ids.includes(productId));
});

test("public /users endpoint hides generated demo accounts", async () => {
  const r = await call("GET", "/api/users");
  assert.equal(r.status, 200);
  assert.ok(!r.json.users.some((u) => u.id === "u_1"), "seed users must not be listed");
});

test("dedupeAndNormalize drops duplicate brand+title and fixes the vertical", () => {
  const input = [
    { id: "a", brand: "Nike", title: "Air Max", category: "Mens Shoes", categoryPath: ["Electronics", "Mens Shoes"], price: 1, mrp: 1, rating: 4, ratingCount: 100, offers: [] },
    { id: "b", brand: "Nike", title: "Air Max", category: "Mens Shoes", categoryPath: ["Electronics", "Mens Shoes"], price: 1, mrp: 1, rating: 4, ratingCount: 50, offers: [] },
  ];
  const { products } = dedupeAndNormalize(input);
  assert.equal(products.length, 1);
  assert.equal(products[0].categoryPath[0], "Footwear");
});

test("catalogue contains no duplicate products", () => {
  const keys = store.products.map((p) => `${p.brand}|${p.title}`.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim());
  assert.equal(new Set(keys).size, keys.length, "catalogue must be deduplicated");
});

test("every product carries a real image URL", () => {
  const missing = store.products.filter((p) => typeof p.image !== "string" || !p.image);
  assert.equal(missing.length, 0, `products without images: ${missing.slice(0, 5).map((p) => p.id).join(", ")}`);
});

test("catalogue includes supplemental well-known-brand products", () => {
  assert.ok(store.products.length > 450, "expected an expanded catalogue");
  assert.ok(store.products.some((p) => /^(Nike|Adidas|Apple|Samsung)$/.test(p.brand)));
});

test("search supports a vertical filter", async () => {
  const r = await call("GET", "/api/search?vertical=Footwear&pageSize=50");
  assert.equal(r.status, 200);
  assert.ok(r.json.total > 0);
  assert.ok(r.json.results.every((p) => (p.categoryPath && p.categoryPath[0]) === "Footwear"));
  assert.equal(r.json.facets.vertical.Footwear, r.json.total);
});

test("GET /api/home returns featured brands and category shelves", async () => {
  const r = await call("GET", "/api/home");
  assert.equal(r.status, 200);
  assert.ok(r.json.featured.length > 0);
  assert.ok(r.json.featuredBrands.length > 0);
  assert.ok(r.json.verticals.length > 0);
  const brands = r.json.featured.map((p) => p.brand);
  assert.equal(new Set(brands).size, brands.length, "featured shelf should span distinct brands");
});

test("recommendations are driven by the user's search history", async () => {
  const reg = await call("POST", "/api/auth/register", {
    body: { name: "Search User", email: "search.user@example.com", password: "secret123" },
  });
  const token = reg.json.token;
  await call("GET", "/api/search?q=moisturizer", { token });
  const rec = await call("GET", "/api/recommendations?limit=5", { token });
  assert.equal(rec.status, 200);
  assert.equal(rec.json.strategy, "search-based");
  assert.ok(rec.json.basedOn.includes("moisturizer"));
  assert.ok(rec.json.items.length > 0);
});
