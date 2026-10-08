"use strict";
/**
 * Matrix factorization for implicit feedback (SGD with negative sampling).
 *
 *   prediction(u,i) = globalMean + b_u + b_i + <p_u, q_i>
 *
 * Positives come from the interaction log (weighted by event type); negatives
 * are sampled uniformly from items the user has not interacted with. This learns
 * latent user/item factors that capture personalized taste.
 */
const { EVENT_WEIGHTS } = require("./popularity");
const { mulberry32 } = require("../utils/rng");
const { topK } = require("../utils/minheap");

class MatrixFactorization {
  constructor({ factors = 16, epochs = 25, lr = 0.02, reg = 0.03, negatives = 3, seed = 42 } = {}) {
    Object.assign(this, { factors, epochs, lr, reg, negatives, seed });
    this.users = new Map(); // id -> index
    this.items = new Map();
    this.itemIds = [];
    this.P = [];
    this.Q = [];
    this.bu = [];
    this.bi = [];
    this.globalMean = 0;
    this.trained = false;
  }

  _dot(a, b) {
    let s = 0;
    for (let i = 0; i < a.length; i++) s += a[i] * b[i];
    return s;
  }

  train(interactions) {
    const rnd = mulberry32(this.seed);
    const positives = new Map(); // user -> Map(item -> weight)
    let sum = 0;
    let count = 0;
    for (const ev of interactions) {
      if (!this.users.has(ev.userId)) this.users.set(ev.userId, this.users.size);
      if (!this.items.has(ev.productId)) {
        this.items.set(ev.productId, this.items.size);
        this.itemIds.push(ev.productId);
      }
      const w = EVENT_WEIGHTS[ev.type] || 1;
      let m = positives.get(ev.userId);
      if (!m) {
        m = new Map();
        positives.set(ev.userId, m);
      }
      m.set(ev.productId, Math.max(m.get(ev.productId) || 0, w));
      sum += 1;
      count += 1;
    }
    this.globalMean = count ? sum / count : 0;

    const nU = this.users.size;
    const nI = this.items.size;
    const init = () => (rnd() - 0.5) * 0.1;
    this.P = Array.from({ length: nU }, () => Array.from({ length: this.factors }, init));
    this.Q = Array.from({ length: nI }, () => Array.from({ length: this.factors }, init));
    this.bu = new Array(nU).fill(0);
    this.bi = new Array(nI).fill(0);

    const predict = (u, i) => this.globalMean + this.bu[u] + this.bi[i] + this._dot(this.P[u], this.Q[i]);

    for (let epoch = 0; epoch < this.epochs; epoch++) {
      for (const [userId, items] of positives) {
        const u = this.users.get(userId);
        for (const [itemId, weight] of items) {
          const i = this.items.get(itemId);
          const err = 1 - predict(u, i);
          this._sgd(u, i, err, 1);
          for (let n = 0; n < this.negatives; n++) {
            const negItem = this.itemIds[Math.floor(rnd() * this.itemIds.length)];
            if (items.has(negItem)) continue;
            const j = this.items.get(negItem);
            const errN = 0 - predict(u, j);
            this._sgd(u, j, errN, 0.5);
          }
        }
      }
    }
    this.trained = true;
    return this;
  }

  _sgd(u, i, err, weight) {
    const { lr, reg } = this;
    const pu = this.P[u];
    const qi = this.Q[i];
    for (let f = 0; f < this.factors; f++) {
      const puf = pu[f];
      const qif = qi[f];
      pu[f] += lr * (err * qif - reg * puf) * weight;
      qi[f] += lr * (err * puf - reg * qif) * weight;
    }
    this.bu[u] += lr * (err - reg * this.bu[u]) * weight;
    this.bi[i] += lr * (err - reg * this.bi[i]) * weight;
  }

  score(userId, itemId) {
    const u = this.users.get(userId);
    const i = this.items.get(itemId);
    if (u == null || i == null) return null;
    return this.globalMean + this.bu[u] + this.bi[i] + this._dot(this.P[u], this.Q[i]);
  }

  recommend(userId, { exclude = new Set(), limit = 10 } = {}) {
    const u = this.users.get(userId);
    if (u == null) return [];
    const out = [];
    for (const itemId of this.itemIds) {
      if (exclude.has(itemId)) continue;
      out.push({ id: itemId, score: this.score(userId, itemId) });
    }
    return topK(out, limit, (x) => x.score);
  }
}

module.exports = { MatrixFactorization };
