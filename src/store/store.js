"use strict";
/**
 * Data store + service wiring.
 *
 * SQLite (see src/db/database.js) is the source of truth. On startup we load
 * the catalogue, users and interactions into memory so the search and
 * recommendation engines stay fast; every mutation is persisted and the
 * relevant in-memory structures are refreshed.
 */
const { SearchService } = require("../search/searchService");
const { RecommendationService } = require("../recommend/recService");
const { annotateAiScores } = require("../catalog/productScore");
const { attachOffers } = require("../../scripts/generate-catalog");
const {
  openDatabase,
  createRepo,
  loadProducts,
  loadUsers,
  loadInteractions,
} = require("../db/database");

function slugify(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function buildCuratedLists(products, popularity) {
  const byCategory = new Map();
  for (const p of products) {
    if (!byCategory.has(p.category)) byCategory.set(p.category, []);
    byCategory.get(p.category).push(p);
  }

  const norm = (val, max) => (max > 0 ? val / max : 0);
  const lists = [];

  for (const [category, items] of byCategory) {
    const maxPop = Math.max(...items.map((p) => popularity.get(p.id) || 0), 1);
    const score = (p) => {
      const value = p.mrp > p.price ? (p.mrp - p.price) / p.mrp : 0;
      const ratingN = norm(p.rating || 0, 5);
      const popN = norm(popularity.get(p.id) || 0, maxPop);
      return 0.5 * ratingN + 0.3 * popN + 0.2 * value;
    };
    const ranked = items.slice().sort((a, b) => score(b) - score(a));
    const prices = items.map((p) => p.price).sort((a, b) => a - b);
    const median = prices[Math.floor(prices.length / 2)];

    const makeList = (suffix, title, filterFn) => {
      const subset = ranked.filter(filterFn).slice(0, 10);
      if (subset.length < 3) return;
      lists.push({
        id: "cl_" + slugify(category) + suffix,
        title,
        category,
        intro: `Top ${category.toLowerCase()} picks ranked by rating, popularity and value.`,
        generatedAt: new Date().toISOString(),
        items: subset.map((p, i) => ({
          rank: i + 1,
          product: p,
          score: Math.round(score(p) * 100 * 10) / 10,
        })),
      });
    };

    makeList("", `Best ${category} Picks`, () => true);
    makeList("-budget", `Best Budget ${category}`, (p) => p.price <= median);
    makeList("-premium", `Premium ${category}`, (p) => p.price > median);
  }
  return lists;
}

function createStore(options = {}) {
  const db = options.db || openDatabase({ file: options.dbFile, seed: options.seed });
  const repo = createRepo(db);

  let products = loadProducts(db);
  // Backfill multi-store offers for older records that predate price comparison.
  if (!products.every((p) => Array.isArray(p.offers))) {
    attachOffers(products);
    repo.products.saveMany(products);
  }
  // Deterministic AI spec score (computed once per product, cached in memory).
  annotateAiScores(products);
  const interactions = loadInteractions(db);
  const users = loadUsers(db);

  const search = new SearchService(products);
  const recs = new RecommendationService(products, interactions, users, search);
  const curatedLists = buildCuratedLists(products, recs.popularity);
  const curatedById = new Map(curatedLists.map((l) => [l.id, l]));

  const eventLog = [];
  const livePopularity = new Map();
  let eventCounter = 0;

  const store = {
    db,
    repo,
    products,
    users,
    interactions,
    search,
    recs,
    curatedLists,
    curatedById,
    eventLog,
    livePopularity,

    recordEvent(ev) {
      const record = {
        id: "ev_" + ++eventCounter,
        userId: ev.userId || null,
        productId: ev.productId || null,
        type: ev.type || "view",
        ts: ev.ts || new Date().toISOString(),
        sessionId: ev.sessionId || null,
      };
      eventLog.push(record);
      repo.events.insert(record);
      if (record.productId) {
        livePopularity.set(record.productId, (livePopularity.get(record.productId) || 0) + 1);
      }
      return record;
    },

    recordSearch(query, total, clickedId) {
      repo.searchLogs.insert({ query, total, clickedId: clickedId || null });
    },

    /** Reload the catalogue from SQLite and rebuild search/recommendation indexes. */
    reloadProducts() {
      store.products = repo.products.all();
      if (!store.products.every((p) => Array.isArray(p.offers))) attachOffers(store.products);
      annotateAiScores(store.products);
      store.search = new SearchService(store.products);
      store.recs = new RecommendationService(store.products, store.interactions, store.users, store.search);
      store.curatedLists = buildCuratedLists(store.products, store.recs.popularity);
      store.curatedById = new Map(store.curatedLists.map((l) => [l.id, l]));
    },

    /** Register a newly created user with the in-memory recommender. */
    addUser(user) {
      store.users.push(user);
      if (store.recs && store.recs.usersById) store.recs.usersById.set(user.id, user);
    },

    analytics() {
      return {
        searches: repo.searchLogs.count(),
        zeroResultSearches: repo.searchLogs.zeroResultCount(),
        topQueries: repo.searchLogs.topQueries(10).map((r) => ({ query: r.query, count: r.count })),
        events: repo.events.count(),
        catalogue: store.search.stats(),
        recommender: store.recs.stats(),
      };
    },
  };

  return store;
}

module.exports = { createStore, buildCuratedLists, slugify };
