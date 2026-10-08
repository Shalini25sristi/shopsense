"use strict";
/**
 * Sparse TF-IDF vector model used as the "semantic" retriever.
 *
 * In production this slot is filled by dense neural embeddings + an ANN index
 * (HNSW). Here we use an interpretable TF-IDF representation over tokens that
 * have been synonym-expanded and phrase-aware, so queries match by meaning
 * (e.g. "earphones" matches "earbuds") without external model dependencies.
 */
const { tokenize, productText } = require("./tokenizer");

function dot(a, b) {
  // iterate the smaller map
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let s = 0;
  for (const [k, v] of small) {
    const w = large.get(k);
    if (w) s += v * w;
  }
  return s;
}

class VectorModel {
  constructor(products) {
    this.N = products.length;
    this.df = new Map();
    this.docs = new Map(); // id -> { vec: Map, norm: number, product }
    this._build(products);
  }

  _build(products) {
    const raw = [];
    for (const p of products) {
      const tokens = tokenize(productText(p), { expand: true });
      const tf = new Map();
      for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
      raw.push({ p, tf });
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) || 0) + 1);
    }
    for (const { p, tf } of raw) {
      const vec = new Map();
      let norm = 0;
      for (const [term, count] of tf) {
        const idf = Math.log((1 + this.N) / (1 + this.df.get(term))) + 1;
        const w = (1 + Math.log(count)) * idf; // sublinear tf
        vec.set(term, w);
        norm += w * w;
      }
      norm = Math.sqrt(norm) || 1;
      for (const [k, v] of vec) vec.set(k, v / norm);
      this.docs.set(p.id, { vec, norm, product: p });
    }
  }

  idf(term) {
    return Math.log((1 + this.N) / (1 + (this.df.get(term) || 0))) + 1;
  }

  vectorize(tokens) {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    const vec = new Map();
    let norm = 0;
    for (const [term, count] of tf) {
      const w = (1 + Math.log(count)) * this.idf(term);
      vec.set(term, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [k, v] of vec) vec.set(k, v / norm);
    return { vec, norm };
  }

  /** Cosine similarity between a query vector and a document id. */
  score(queryVec, docId) {
    const doc = this.docs.get(docId);
    if (!doc) return 0;
    return dot(queryVec.vec, doc.vec); // both unit-normalized
  }

  /** Rank all documents by cosine similarity to the query tokens. */
  search(queryTokens) {
    const qv = this.vectorize(queryTokens);
    const out = [];
    for (const [id, doc] of this.docs) {
      const s = dot(qv.vec, doc.vec);
      if (s > 0) out.push({ id, score: s });
    }
    out.sort((a, b) => b.score - a.score);
    return out;
  }

  /** Most similar products to a given product (content-based). */
  similar(docId, limit = 6) {
    const target = this.docs.get(docId);
    if (!target) return [];
    const out = [];
    for (const [id, doc] of this.docs) {
      if (id === docId) continue;
      out.push({ id, score: dot(target.vec, doc.vec) });
    }
    out.sort((a, b) => b.score - a.score);
    return out.slice(0, limit);
  }
}

module.exports = { VectorModel, dot };
