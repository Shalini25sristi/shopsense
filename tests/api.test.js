"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createStore } = require("../src/store/store");
const { handleApi } = require("../src/api/routes");
const { handleGo } = require("../src/server");

const store = createStore();

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

async function get(path) {
  const res = mockRes();
  const req = { method: "GET" };
  await handleApi(req, res, new URL("http://localhost" + path), store);
  return { status: res.status, json: res.body ? JSON.parse(res.body) : null };
}

test("GET /api/health", async () => {
  const r = await get("/api/health");
  assert.equal(r.status, 200);
  assert.equal(r.json.ok, true);
  assert.ok(r.json.products > 0);
});

test("GET /api/search", async () => {
  const r = await get("/api/search?q=earbuds");
  assert.equal(r.status, 200);
  assert.ok(r.json.total > 0);
  assert.ok(Array.isArray(r.json.results));
});

test("GET /api/products/:id returns detail with recommendations", async () => {
  const id = store.products[0].id;
  const r = await get(`/api/products/${id}`);
  assert.equal(r.status, 200);
  assert.equal(r.json.product.id, id);
  assert.ok(Array.isArray(r.json.similar));
  assert.ok(Array.isArray(r.json.alsoViewed));
});

test("GET /api/recommendations for a user", async () => {
  const user = store.users.find((u) => !u.coldStart);
  const r = await get(`/api/recommendations?userId=${user.id}&limit=5`);
  assert.equal(r.status, 200);
  assert.equal(r.json.strategy, "hybrid");
  assert.ok(r.json.items.length > 0);
});

test("GET /api/curated-lists and detail", async () => {
  const list = await get("/api/curated-lists");
  assert.equal(list.status, 200);
  assert.ok(list.json.lists.length > 0);
  const detail = await get(`/api/curated-lists/${list.json.lists[0].id}`);
  assert.equal(detail.status, 200);
  assert.ok(detail.json.items.length > 0);
});

test("GET /api/products/:id/prices returns multi-store offers", async () => {
  const id = store.products[0].id;
  const r = await get(`/api/products/${id}/prices`);
  assert.equal(r.status, 200);
  assert.ok(r.json.offers.length >= 2, "expected at least 2 stores");
  assert.equal(r.json.offers[0].price, r.json.lowest.price, "lowest must be first");
  for (let i = 1; i < r.json.offers.length; i++) {
    assert.ok(r.json.offers[i].price >= r.json.offers[i - 1].price, "offers must be price-sorted");
  }
});

test("product detail includes offers", async () => {
  const id = store.products[0].id;
  const r = await get(`/api/products/${id}`);
  assert.ok(Array.isArray(r.json.offers));
  assert.ok(r.json.offers.length >= 2);
  assert.ok(r.json.lowest && r.json.stores >= 2);
});

test("product detail includes specifications and aggregated reviews", async () => {
  const id = store.products[0].id;
  const r = await get(`/api/products/${id}`);
  assert.ok(Array.isArray(r.json.specs) && r.json.specs.length > 0, "expected spec groups");
  assert.ok(r.json.specs.every((g) => g.title && Array.isArray(g.items)));
  assert.ok(r.json.reviews && r.json.reviews.summary.total > 0);
  assert.ok(r.json.reviews.summary.bySource.length > 0, "expected reviews from multiple stores");
  assert.ok(r.json.reviews.reviews.length > 0);
});

test("GET /api/products/:id/reviews and /specs sub-resources", async () => {
  const id = store.products[0].id;
  const rev = await get(`/api/products/${id}/reviews?limit=3`);
  assert.equal(rev.status, 200);
  assert.ok(rev.json.reviews.length > 0);
  assert.ok(rev.json.summary.average > 0);
  const specs = await get(`/api/products/${id}/specs`);
  assert.equal(specs.status, 200);
  assert.ok(specs.json.specs.length > 0);
});

test("GET /api/images/:id.svg returns an SVG product image", async () => {
  const id = store.products[0].id;
  const res = mockRes();
  await handleApi({ method: "GET" }, res, new URL(`http://localhost/api/images/${id}.svg`), store);
  assert.equal(res.status, 200);
  assert.match(res.headers["Content-Type"], /image\/svg\+xml/);
  assert.ok(res.body.includes("<svg"));
});

test("/go redirects to the merchant deep link", () => {
  const product = store.products[0];
  const offer = product.offers[0];
  const res = { status: 0, headers: {}, writeHead(s, h) { this.status = s; this.headers = h; }, end() {} };
  handleGo(res, new URL(`http://localhost/go?product=${product.id}&merchant=${offer.merchantSlug}`), store);
  assert.equal(res.status, 302);
  assert.match(res.headers.Location, /^https:\/\//);
  assert.ok(res.headers.Location.includes(offer.domain), "should target the merchant domain");
});

test("/go builds a brand+title product link without duplicating the brand", () => {
  const product = store.products.find((p) => p.brand && p.title.toLowerCase().startsWith(p.brand.toLowerCase())) || store.products[0];
  const offer = product.offers[0];
  const res = { status: 0, headers: {}, writeHead(s, h) { this.status = s; this.headers = h; }, end() {} };
  handleGo(res, new URL(`http://localhost/go?product=${product.id}&merchant=${offer.merchantSlug}`), store);
  const loc = decodeURIComponent(res.headers.Location).toLowerCase();
  assert.ok(loc.includes(product.title.toLowerCase()), "link should target the exact product title");
  assert.ok(!loc.includes(`${product.brand.toLowerCase()} ${product.brand.toLowerCase()}`), "brand must not be duplicated");
});

test("/go rejects an untrusted u parameter (open-redirect protection)", () => {
  const res = { status: 0, headers: {}, writeHead(s, h) { this.status = s; this.headers = h; }, end() {} };
  handleGo(res, new URL("http://localhost/go?u=https://evil.example.com/x&merchant=amazon&q=shoes"), store);
  assert.equal(res.status, 302);
  assert.ok(!res.headers.Location.includes("evil.example.com"));
});

test("unknown route returns 404", async () => {
  const r = await get("/api/nope");
  assert.equal(r.status, 404);
});
