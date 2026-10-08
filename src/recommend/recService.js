"use strict";
/**
 * Hybrid recommender that blends four signals:
 *   - popularity / trending (always available, cold-start friendly)
 *   - content-based similarity (TF-IDF vectors)
 *   - item-item collaborative filtering
 *   - matrix factorization (personalized latent factors)
 *
 * Every recommendation carries a human-readable reason (explainability).
 */
const { computePopularity, EVENT_WEIGHTS } = require("./popularity");
const { ItemItemCF } = require("./itemItemCF");
const { MatrixFactorization } = require("./matrixFactor");
const { topK } = require("../utils/minheap");

const WEIGHTS = { cf: 0.4, mf: 0.3, content: 0.2, pop: 0.1, search: 0.35 };

function normalizeMap(m) {
  let max = 0;
  for (const v of m.values()) if (v > max) max = v;
  if (max <= 0) max = 1;
  const out = new Map();
  for (const [k, v] of m) out.set(k, v / max);
  return out;
}

class RecommendationService {
  constructor(products, interactions, users, searchService, { now = Date.now() } = {}) {
    this.products = products;
    this.byId = new Map(products.map((p) => [p.id, p]));
    this.users = users;
    this.usersById = new Map(users.map((u) => [u.id, u]));
    this.search = searchService;
    this.vector = searchService.vector;
    this.now = now;

    this.popularity = computePopularity(interactions, { now, halfLifeDays: 21 });
    this.itemItem = new ItemItemCF(interactions, { topNeighbours: 20 });
    this.mf = new MatrixFactorization({ factors: 16, epochs: 30, seed: 42 }).train(interactions);

    // per-user item weights (recency-aware) for personalization
    this.userWeights = new Map();
    const lambda = Math.LN2 / 30;
    for (const ev of interactions) {
      const w = EVENT_WEIGHTS[ev.type] || 1;
      const ageDays = Math.max(0, (now - new Date(ev.ts).getTime()) / 86400000);
      const decay = Math.exp(-lambda * ageDays);
      let m = this.userWeights.get(ev.userId);
      if (!m) {
        m = new Map();
        this.userWeights.set(ev.userId, m);
      }
      m.set(ev.productId, (m.get(ev.productId) || 0) + w * decay);
    }
  }

  _product(id) {
    return this.byId.get(id) || null;
  }

  _wrap(list) {
    return list
      .map((x) => ({ product: this._product(x.id), score: Math.round((x.score || 0) * 1000) / 1000 }))
      .filter((x) => x.product);
  }

  trending({ category = null, limit = 12 } = {}) {
    const entries = [];
    for (const [id, score] of this.popularity) {
      const p = this._product(id);
      if (!p) continue;
      if (category && p.category !== category) continue;
      entries.push({ id, score });
    }
    entries.sort((a, b) => b.score - a.score);
    return this._wrap(entries.slice(0, limit)).map((x) => ({
      ...x,
      reason: category ? `Trending in ${category}` : "Trending now",
    }));
  }

  similar(productId, limit = 6) {
    const base = this.vector.similar(productId, limit);
    return this._wrap(base).map((x) => ({ ...x, reason: "Similar attributes" }));
  }

  alsoViewed(productId, limit = 6) {
    const list = this.itemItem.neighbours(productId, limit);
    return this._wrap(list).map((x) => ({ ...x, reason: "Users who viewed this also viewed" }));
  }

  /**
   * Build a score map from the user's recent search queries: the query results
   * are weighted by rank and expanded with content-similar products.
   */
  searchProfile(queries, { perQuery = 20, expand = 8 } = {}) {
    const scores = new Map();
    if (!this.search || !queries || !queries.length) return scores;
    for (const query of queries) {
      let res;
      try {
        res = this.search.search({ q: query, pageSize: perQuery });
      } catch {
        continue;
      }
      const results = (res && res.results) || [];
      const n = results.length;
      results.forEach((p, i) => {
        if (!p || !p.id) return;
        const w = n > 0 ? (n - i) / n : 1;
        scores.set(p.id, (scores.get(p.id) || 0) + w);
        for (const s of this.vector.similar(p.id, expand)) {
          scores.set(s.id, (scores.get(s.id) || 0) + w * 0.5 * (s.score || 0));
        }
      });
    }
    return scores;
  }

  forUser(userId, { limit = 10, excludeSeen = true, queries = [] } = {}) {
    const user = this.usersById.get(userId);
    const uw = this.userWeights.get(userId) || new Map();
    const seen = new Set(uw.keys());
    const searchProfile = this.searchProfile(queries);

    if (uw.size === 0 && searchProfile.size === 0) {
      return this._coldStart(user, { limit, exclude: excludeSeen ? seen : new Set() });
    }

    const exclude = excludeSeen ? seen : new Set();

    const cfList = this.itemItem.recommendForUser(uw, { exclude, limit: 60 });
    const mfList = this.mf.recommend(userId, { exclude, limit: 60 });
    const cf = normalizeMap(new Map(cfList.map((x) => [x.id, x.score])));
    const mf = normalizeMap(new Map(mfList.map((x) => [x.id, x.score])));

    // content-based from the user's strongest recent items
    const recent = Array.from(uw.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    const content = new Map();
    const contentFrom = new Map();
    for (const [itemId] of recent) {
      for (const s of this.vector.similar(itemId, 12)) {
        if (exclude.has(s.id)) continue;
        content.set(s.id, (content.get(s.id) || 0) + s.score);
        if (!contentFrom.has(s.id)) contentFrom.set(s.id, itemId);
      }
    }
    const contentNorm = normalizeMap(content);
    const popNorm = normalizeMap(this.popularity);
    const searchNorm = normalizeMap(searchProfile);

    const combined = new Map();
    const contributions = new Map();
    const add = (map, key, weight, label, extra) => {
      for (const [id, val] of map) {
        if (exclude.has(id)) continue;
        const c = contributions.get(id) || { cf: 0, mf: 0, content: 0, pop: 0, search: 0, extra: {} };
        c[key] += weight * val;
        if (extra) c.extra[key] = extra.get(id);
        contributions.set(id, c);
        combined.set(id, (combined.get(id) || 0) + weight * val);
      }
    };
    add(cf, "cf", WEIGHTS.cf, "cf");
    add(mf, "mf", WEIGHTS.mf, "mf");
    add(contentNorm, "content", WEIGHTS.content, "content", contentFrom);
    add(popNorm, "pop", WEIGHTS.pop, "pop");
    add(searchNorm, "search", WEIGHTS.search, "search");

    const ranked = topK(
      Array.from(combined.entries()).map(([id, score]) => ({ id, score })),
      limit,
      (x) => x.score
    );

    return ranked
      .map((x) => {
        const p = this._product(x.id);
        if (!p) return null;
        return {
          product: p,
          score: Math.round(x.score * 1000) / 1000,
          reason: this._reasonFor(contributions.get(x.id)),
        };
      })
      .filter(Boolean);
  }

  _reasonFor(c) {
    if (!c) return "Recommended for you";
    const parts = [
      ["cf", c.cf, "Users who viewed this also viewed"],
      ["mf", c.mf, "Based on your activity"],
      ["content", c.content, "Similar to items you viewed"],
      ["pop", c.pop, "Trending now"],
      ["search", c.search, "Based on your recent searches"],
    ];
    parts.sort((a, b) => b[1] - a[1]);
    const top = parts[0];
    if (top[0] === "content" && c.extra && c.extra.content) {
      const src = this._product(c.extra.content);
      if (src) return `Similar to ${src.title}`;
    }
    return top[2];
  }

  _coldStart(user, { limit, exclude }) {
    const scores = new Map();
    const reasons = new Map();
    const likedTags = (user && user.preferences && user.preferences.likedTags) || [];
    const prefCategory = user && user.preferences && user.preferences.category;

    // popularity prior, boosted for the user's preferred category
    for (const [id, score] of this.popularity) {
      const p = this._product(id);
      if (!p || exclude.has(id)) continue;
      let s = score;
      if (prefCategory && p.category === prefCategory) s *= 2.5;
      scores.set(id, s);
      reasons.set(id, prefCategory && p.category === prefCategory ? `Popular in ${prefCategory}` : "Trending now");
    }

    // content-based on liked tags
    for (const p of this.products) {
      if (exclude.has(p.id)) continue;
      const overlap = (p.tags || []).filter((t) => likedTags.includes(t)).length;
      if (overlap > 0) {
        scores.set(p.id, (scores.get(p.id) || 0) + overlap * 1.5);
        if (!reasons.has(p.id) || overlap >= 2) reasons.set(p.id, `Because you like ${likedTags[0]}`);
      }
    }

    const ranked = topK(
      Array.from(scores.entries()).map(([id, score]) => ({ id, score })),
      limit,
      (x) => x.score
    );
    return ranked
      .map((x) => {
        const p = this._product(x.id);
        if (!p) return null;
        return { product: p, score: Math.round(x.score * 1000) / 1000, reason: reasons.get(x.id) || "Popular now" };
      })
      .filter(Boolean);
  }

  stats() {
    return {
      usersWithHistory: this.userWeights.size,
      itemsInCF: this.itemItem.itemUsers.size,
      mfUsers: this.mf.users.size,
      mfItems: this.mf.items.size,
    };
  }
}

module.exports = { RecommendationService };
