"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { createStore } = require("../src/store/store");
const { tokenize } = require("../src/search/tokenizer");
const { levenshtein, nearestTerms } = require("../src/search/fuzzy");
const { Trie } = require("../src/search/trie");
const { topK } = require("../src/utils/minheap");

const store = createStore();
const sample = store.products[0];

test("tokenizer stems words and expands synonyms", () => {
  const t = tokenize("earphones");
  assert.ok(t.includes("earbud"), `expected synonym earbud in ${t}`);
});

test("tokenizer detects multi-word phrases", () => {
  const t = tokenize("shoes for flat feet");
  assert.ok(t.includes("flat_feet"), `expected flat_feet in ${t}`);
});

test("levenshtein distance is correct", () => {
  assert.equal(levenshtein("kitten", "sitting"), 3);
  assert.equal(levenshtein("sunscreen", "sunscreen"), 0);
});

test("nearestTerms finds the right correction", () => {
  const out = nearestTerms("sunscren", ["sunscreen", "moisturizer", "serum"], 2);
  assert.equal(out[0].term, "sunscreen");
});

test("trie returns prefix suggestions ranked by weight", () => {
  const t = new Trie();
  t.insert("running", 5);
  t.insert("runner", 2);
  t.insert("rugged", 9);
  assert.deepEqual(t.suggest("runn").map((s) => s.word), ["running", "runner"]);
});

test("topK returns the k largest using a bounded heap", () => {
  const items = [{ s: 1 }, { s: 5 }, { s: 3 }, { s: 9 }, { s: 2 }];
  assert.deepEqual(topK(items, 2, (x) => x.s).map((x) => x.s), [9, 5]);
});

test("hybrid search finds an indexed product by its title", () => {
  const q = sample.title.split(/\s+/).slice(0, 3).join(" ");
  const r = store.search.search({ q, pageSize: 10 });
  assert.ok(r.total > 0, `expected results for "${q}"`);
  assert.ok(r.results.some((x) => x.id === sample.id), "expected the source product in results");
  assert.ok(["hybrid", "lexical", "semantic"].includes(r.strategy));
});

test("search is typo tolerant (corrects a one-character deletion)", () => {
  const term = store.search.index.vocabulary().find((t) => t.length >= 7 && /^[a-z]+$/.test(t));
  assert.ok(term, "expected a long vocab term");
  const typo = term.slice(0, 3) + term.slice(4);
  const r = store.search.search({ q: typo, pageSize: 5 });
  assert.ok(r.total > 0, `expected results for typo "${typo}"`);
  assert.ok(r.corrected.length >= 1, "expected a correction to be applied");
});

test("hair oil returns actual hair-oil products (no chair, no cooking oil)", () => {
  const r = store.search.search({ q: "hair oil", pageSize: 5 });
  assert.ok(r.total > 0, "expected hair-oil products in the catalogue");
  assert.ok(
    !r.corrected.some((c) => c.from === "hair" && c.to === "chair"),
    "hair must not be corrected to chair"
  );
  for (const x of r.results) {
    const full = store.search.product(x.id);
    const hay = JSON.stringify(full).toLowerCase();
    assert.ok(hay.includes("hair") && hay.includes("oil"), `unrelated result: ${x.title}`);
  }
});

test("unknown words return no results (no random matches)", () => {
  const r = store.search.search({ q: "zzzqqx", pageSize: 5 });
  assert.equal(r.total, 0);
  assert.ok(r.message);
});

test("multi-word queries match all terms when they co-occur (AND semantics)", () => {
  const a = store.products.find((p) => p.title.split(/\s+/).filter((w) => w.length > 2).length >= 2);
  const words = a.title.split(/\s+/).filter((w) => w.length > 2).slice(0, 2);
  const r = store.search.search({ q: words.join(" "), pageSize: 10 });
  assert.ok(r.total > 0, `expected results for "${words.join(" ")}"`);
  assert.equal(r.exactMatch, true);
  assert.ok(r.results.some((x) => x.id === a.id), "expected the source product in results");
});

test("search returns facets", () => {
  const r = store.search.search({ q: sample.brand, pageSize: 5 });
  assert.ok(r.facets.brand && Object.keys(r.facets.brand).length > 0);
  assert.ok(r.facets.price);
});

test("autocomplete returns suggestions", () => {
  const s = store.search.suggest(sample.title.slice(0, 3).toLowerCase());
  assert.ok(s.length > 0);
});

test("price filter is respected", () => {
  const r = store.search.search({ category: sample.category, priceMax: 500, pageSize: 50 });
  assert.ok(r.results.every((x) => x.price <= 500));
});

test("empty price params are ignored (regression: browser sends priceMin=)", () => {
  const q = sample.title.split(/\s+/)[0];
  const r = store.search.search({ q, priceMin: "", priceMax: "", sort: "relevance", pageSize: 24 });
  assert.ok(r.total > 0, "empty price params must not filter out everything");
});

test("empty query browses the full catalogue", () => {
  const r = store.search.search({ q: "", pageSize: 24 });
  assert.equal(r.total, store.products.length);
  assert.equal(r.results.length, 24);
});

test("a real query returns 100+ results (Google-style recall)", () => {
  const r = store.search.search({ q: "running shoes", pageSize: 10 });
  assert.ok(r.total >= 100, `expected 100+ results, got ${r.total}`);
  assert.equal(r.results.length, 10);
  assert.ok(r.results.every((x) => typeof x.related === "boolean"));
  assert.ok(r.related >= 1, "expected a related backfill");
});

test("real product images are present in the catalogue", () => {
  const withImage = store.products.filter((p) => typeof p.image === "string" && p.image.startsWith("http"));
  assert.ok(withImage.length > 0, "expected products to carry real image URLs");
});
