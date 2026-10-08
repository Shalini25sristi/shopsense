"use strict";
/**
 * Item-item collaborative filtering.
 * "Users who interacted with item A also interacted with item B."
 *
 * 1. Build item -> { user -> weight } from implicit feedback.
 * 2. Compute cosine similarity between item vectors.
 * 3. Keep the top-K neighbours per item.
 * 4. Score a user by summing neighbour similarities over items they engaged with.
 */
const { EVENT_WEIGHTS } = require("./popularity");
const { topK } = require("../utils/minheap");

class ItemItemCF {
  constructor(interactions, { topNeighbours = 20 } = {}) {
    this.itemUsers = new Map(); // itemId -> Map(userId -> weight)
    this._build(interactions);
    this.topNeighbours = topNeighbours;
    this.neighbourMap = this._computeNeighbours();
  }

  _build(interactions) {
    for (const ev of interactions) {
      const w = EVENT_WEIGHTS[ev.type] || 1;
      let m = this.itemUsers.get(ev.productId);
      if (!m) {
        m = new Map();
        this.itemUsers.set(ev.productId, m);
      }
      m.set(ev.userId, (m.get(ev.userId) || 0) + w);
    }
  }

  _norm(m) {
    let s = 0;
    for (const v of m.values()) s += v * v;
    return Math.sqrt(s) || 1;
  }

  _computeNeighbours() {
    const norms = new Map();
    for (const [id, m] of this.itemUsers) norms.set(id, this._norm(m));

    const neighbours = new Map();
    const items = Array.from(this.itemUsers.keys());
    for (let a = 0; a < items.length; a++) {
      const ia = items[a];
      const ma = this.itemUsers.get(ia);
      const sims = new Map();
      for (let b = 0; b < items.length; b++) {
        if (a === b) continue;
        const ib = items[b];
        const mb = this.itemUsers.get(ib);
        let dot = 0;
        const [small, large] = ma.size <= mb.size ? [ma, mb] : [mb, ma];
        for (const [u, w] of small) {
          const w2 = large.get(u);
          if (w2) dot += w * w2;
        }
        if (dot > 0) {
          const sim = dot / (norms.get(ia) * norms.get(ib));
          sims.set(ib, sim);
        }
      }
      const list = Array.from(sims.entries()).map(([id, score]) => ({ id, score }));
      neighbours.set(ia, topK(list, this.topNeighbours, (x) => x.score));
    }
    return neighbours;
  }

  neighbours(itemId, limit = 8) {
    const list = this.neighbourMap.get(itemId) || [];
    return list.slice(0, limit).map((x) => ({ id: x.id, score: Math.round(x.score * 1000) / 1000 }));
  }

  /** Recommend for a user given their item weights { itemId: weight }. */
  recommendForUser(userWeights, { exclude = new Set(), limit = 10 } = {}) {
    const scores = new Map();
    for (const [itemId, w] of userWeights) {
      const neigh = this.neighbourMap.get(itemId);
      if (!neigh) continue;
      for (const n of neigh) {
        if (exclude.has(n.id)) continue;
        scores.set(n.id, (scores.get(n.id) || 0) + n.score * w);
      }
    }
    return topK(
      Array.from(scores.entries()).map(([id, score]) => ({ id, score })),
      limit,
      (x) => x.score
    );
  }
}

module.exports = { ItemItemCF };
