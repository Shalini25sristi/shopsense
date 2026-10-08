"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createStore } = require("../src/store/store");

const store = createStore();

test("trending returns scored items", () => {
  const items = store.recs.trending({ limit: 5 });
  assert.ok(items.length > 0);
  assert.ok(items.every((x) => x.product && x.reason));
});

test("content-based similar items are returned", () => {
  const p = store.products.find((x) => store.recs.itemItem.itemUsers.has(x.id));
  const items = store.recs.similar(p.id, 5);
  assert.ok(items.length > 0);
  assert.ok(items.every((x) => x.product.id !== p.id));
});

test("item-item CF returns neighbours for an interacted item", () => {
  const id = Array.from(store.recs.itemItem.itemUsers.keys())[0];
  const neigh = store.recs.itemItem.neighbours(id, 5);
  assert.ok(neigh.length > 0);
  assert.ok(neigh.every((n) => n.score >= 0));
});

test("matrix factorization produces personalized scores", () => {
  const user = store.users.find((u) => !u.coldStart);
  const item = store.products[0];
  const s = store.recs.mf.score(user.id, item.id);
  assert.equal(typeof s, "number");
});

test("personalized recommendations include explanations", () => {
  const user = store.users.find((u) => !u.coldStart);
  const items = store.recs.forUser(user.id, { limit: 8 });
  assert.ok(items.length > 0);
  assert.ok(items.every((x) => x.reason && x.product));
});

test("cold-start users still get recommendations", () => {
  const cold = store.users.find((u) => u.coldStart);
  if (!cold) return; // no cold users in this dataset
  const items = store.recs.forUser(cold.id, { limit: 8 });
  assert.ok(items.length > 0);
  assert.ok(items.every((x) => x.reason));
});

test("recommendations exclude already-seen items", () => {
  const user = store.users.find((u) => !u.coldStart);
  const seen = new Set((store.recs.userWeights.get(user.id) || new Map()).keys());
  const items = store.recs.forUser(user.id, { limit: 10 });
  assert.ok(items.every((x) => !seen.has(x.product.id)));
});
