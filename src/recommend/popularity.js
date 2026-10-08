"use strict";
/**
 * Time-decayed popularity / trending.
 * Each interaction contributes its event weight, decayed exponentially by age
 * (half-life in days). This keeps "trending" fresh and is a strong baseline.
 */
const EVENT_WEIGHTS = { view: 1, click: 2, wishlist: 3, cart: 4, purchase: 5 };

function computePopularity(interactions, { now = Date.now(), halfLifeDays = 21 } = {}) {
  const lambda = Math.LN2 / halfLifeDays;
  const scores = new Map();
  for (const ev of interactions) {
    const w = EVENT_WEIGHTS[ev.type] || 1;
    const ageDays = Math.max(0, (now - new Date(ev.ts).getTime()) / 86400000);
    const decay = Math.exp(-lambda * ageDays);
    scores.set(ev.productId, (scores.get(ev.productId) || 0) + w * decay);
  }
  return scores;
}

module.exports = { computePopularity, EVENT_WEIGHTS };
