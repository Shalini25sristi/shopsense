"use strict";
/**
 * BM25 ranking over an InvertedIndex.
 * score(D,Q) = sum_t IDF(t) * (tf * (k1+1)) / (tf + k1*(1 - b + b*|D|/avgdl))
 * IDF(t) = ln(1 + (N - df + 0.5) / (df + 0.5))
 */
class BM25 {
  constructor(index, { k1 = 1.2, b = 0.75 } = {}) {
    this.index = index;
    this.k1 = k1;
    this.b = b;
  }

  idf(term) {
    const { N } = this.index;
    const df = this.index.df(term);
    return Math.log(1 + (N - df + 0.5) / (df + 0.5));
  }

  score(queryTokens, docId) {
    const avgdl = this.index.avgdl || 1;
    const dl = this.index.docLengths.get(docId) || 0;
    let score = 0;
    const seen = new Set();
    for (const term of queryTokens) {
      if (seen.has(term)) continue;
      seen.add(term);
      const list = this.index.get(term);
      if (!list) continue;
      const tf = list.get(docId);
      if (!tf) continue;
      const idf = this.idf(term);
      const denom = tf + this.k1 * (1 - this.b + (this.b * dl) / avgdl);
      score += idf * ((tf * (this.k1 + 1)) / denom);
    }
    return score;
  }

  /** Rank all documents matching any query term. Returns [{ id, score }]. */
  search(queryTokens) {
    const candidates = new Set();
    for (const term of queryTokens) {
      const list = this.index.get(term);
      if (!list) continue;
      for (const docId of list.keys()) candidates.add(docId);
    }
    const results = [];
    for (const docId of candidates) {
      const s = this.score(queryTokens, docId);
      if (s > 0) results.push({ id: docId, score: s });
    }
    results.sort((a, b) => b.score - a.score);
    return results;
  }
}

module.exports = { BM25 };
