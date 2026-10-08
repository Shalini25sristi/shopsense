"use strict";
/**
 * Inverted index: term -> posting list of { docId, tf }.
 * Also tracks document lengths and vocabulary for BM25 and fuzzy matching.
 */
class InvertedIndex {
  constructor() {
    this.postings = new Map(); // term -> Map(docId -> tf)
    this.docLengths = new Map(); // docId -> number of tokens
    this.documents = new Map(); // docId -> product
    this.totalLength = 0;
  }

  addDocument(docId, tokens, product) {
    const tf = new Map();
    for (const t of tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const [term, count] of tf) {
      let list = this.postings.get(term);
      if (!list) {
        list = new Map();
        this.postings.set(term, list);
      }
      list.set(docId, count);
    }
    this.docLengths.set(docId, tokens.length);
    this.documents.set(docId, product);
    this.totalLength += tokens.length;
  }

  get N() {
    return this.docLengths.size;
  }

  get avgdl() {
    return this.N === 0 ? 0 : this.totalLength / this.N;
  }

  df(term) {
    const list = this.postings.get(term);
    return list ? list.size : 0;
  }

  get(term) {
    return this.postings.get(term);
  }

  get length() {
    return this.postings.size;
  }

  /** All terms in the vocabulary (used by fuzzy matching). */
  vocabulary() {
    return Array.from(this.postings.keys());
  }
}

module.exports = { InvertedIndex };
