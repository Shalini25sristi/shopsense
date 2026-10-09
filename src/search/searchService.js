"use strict";
/**
 * Hybrid search service.
 *
 * Pipeline: query processing (tokenize + synonym/phrase + typo correction)
 *   -> lexical retrieval (BM25)
 *   -> semantic retrieval (TF-IDF vector cosine)
 *   -> Reciprocal Rank Fusion
 *   -> filters + facets
 *   -> sort + paginate
 */
const { InvertedIndex } = require("./invertedIndex");
const { BM25 } = require("./bm25");
const { VectorModel } = require("./vectorModel");
const { Trie } = require("./trie");
const { tokenize, productText, stem, SYNONYMS, STOPWORDS } = require("./tokenizer");
const { nearestTerms } = require("./fuzzy");

const RRF_K = 60;

function rrfFuse(lists, weights = []) {
  const scores = new Map();
  lists.forEach((list, li) => {
    const w = weights[li] == null ? 1 : weights[li];
    list.forEach((item, rank) => {
      const add = w * (1 / (RRF_K + rank + 1));
      scores.set(item.id, (scores.get(item.id) || 0) + add);
    });
  });
  return Array.from(scores.entries()).map(([id, score]) => ({ id, score }));
}

class SearchService {
  constructor(products) {
    this.products = products;
    this.byId = new Map(products.map((p) => [p.id, p]));
    this.index = new InvertedIndex();
    this._buildIndex();
    this.vector = new VectorModel(products);
    this.bm25 = new BM25(this.index);
    this.trie = new Trie();
    this._buildTrie();
    this.vocabSet = new Set(this.index.vocabulary());
  }

  _buildIndex() {
    for (const p of this.products) {
      const tokens = tokenize(productText(p), { expand: true });
      this.index.addDocument(p.id, tokens, p);
    }
  }

  _buildTrie() {
    const addWords = (text, weight) => {
      const words = String(text || "")
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length >= 3);
      for (const w of words) this.trie.insert(w, weight);
    };
    for (const p of this.products) {
      const w = 1 + Math.log(1 + (p.ratingCount || 0));
      addWords(p.brand, w * 2);
      addWords(p.category, w * 2);
      addWords(p.title, w);
      for (const t of p.tags || []) addWords(t, w * 0.5);
    }
  }

  _matchesFilters(p, f) {
    if (f.category && p.category !== f.category) return false;
    if (f.vertical && ((p.categoryPath && p.categoryPath[0]) || p.category) !== f.vertical) return false;
    if (f.brand && p.brand !== f.brand) return false;
    if (f.priceMin != null && p.price < f.priceMin) return false;
    if (f.priceMax != null && p.price > f.priceMax) return false;
    if (f.minRating != null && p.rating < f.minRating) return false;
    if (f.inStock && !p.inStock) return false;
    return true;
  }

  _facets(products) {
    const brand = {};
    const category = {};
    const vertical = {};
    const price = { "0-1000": 0, "1000-5000": 0, "5000-20000": 0, "20000+": 0 };
    for (const p of products) {
      brand[p.brand] = (brand[p.brand] || 0) + 1;
      category[p.category] = (category[p.category] || 0) + 1;
      const v = (p.categoryPath && p.categoryPath[0]) || p.category;
      vertical[v] = (vertical[v] || 0) + 1;
      if (p.price < 1000) price["0-1000"]++;
      else if (p.price < 5000) price["1000-5000"]++;
      else if (p.price < 20000) price["5000-20000"]++;
      else price["20000+"]++;
    }
    const sortObj = (o) =>
      Object.fromEntries(Object.entries(o).sort((a, b) => b[1] - a[1]));
    return { brand: sortObj(brand), category: sortObj(category), vertical: sortObj(vertical), price };
  }

  _prior(p) {
    return 0.0006 * Math.log(1 + (p.ratingCount || 0)) + 0.0006 * (p.rating || 0);
  }

  /**
   * Split a query into word groups. Each group is one meaningful query word
   * plus its synonym tokens (alternatives). Matching is AND across groups,
   * OR within a group. Stop-words are dropped.
   */
  _wordGroups(q) {
    const words = String(q || "")
      .toLowerCase()
      .replace(/[^a-z0-9_\s]/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    const groups = [];
    for (const raw of words) {
      if (STOPWORDS.has(raw)) continue;
      const w = stem(raw);
      const tokens = new Set([w]);
      const syn = SYNONYMS[raw] || SYNONYMS[w];
      if (syn) for (const s of syn) tokens.add(s.includes("_") ? s : stem(s));
      groups.push({ raw, tokens: Array.from(tokens) });
    }
    return groups;
  }

  _docHasToken(id, term) {
    const list = this.index.get(term);
    return !!(list && list.has(id));
  }

  /** A document matches a group if it contains any of the group's tokens. */
  _matchesGroup(id, group) {
    return group.tokens.some((t) => this._docHasToken(id, t));
  }

  search(params = {}) {
    const started = Date.now();
    const q = (params.q || "").trim();
    const numOrNull = (v) => {
      if (v == null || v === "" || v === "undefined") return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const filters = {
      category: params.category || null,
      vertical: params.vertical || null,
      brand: params.brand || null,
      priceMin: numOrNull(params.priceMin),
      priceMax: numOrNull(params.priceMax),
      minRating: numOrNull(params.minRating),
      inStock: params.inStock === true || params.inStock === "true",
    };

    let strategy = "browse";
    let fixes = [];
    let candidateIds = null; // null means "all products" (browse)
    let groups = [];
    let exactMatch = true;
    let message = null;
    const scoreMap = new Map();

    if (q) {
      groups = this._wordGroups(q);
      const vocabList = this.index.vocabulary();

      // Correct likely typos. Only words of length >= 5 are corrected, so a
      // real word like "hair" is never rewritten to "chair".
      for (const g of groups) {
        const known = g.tokens.some((t) => this.index.df(t) > 0);
        if (!known && g.raw.length >= 5) {
          const cand = nearestTerms(g.tokens[0], vocabList, 1, 1)[0];
          if (cand) {
            g.tokens = [cand.term];
            fixes.push({ from: g.raw, to: cand.term });
          }
        }
      }

      // If a query word exists nowhere in the catalogue, there is no real match
      // (Google-like: don't show unrelated products).
      const unknown = groups.filter((g) => !g.tokens.some((t) => this.index.df(t) > 0));
      if (groups.length > 0 && unknown.length > 0) {
        strategy = "none";
        candidateIds = new Set();
        exactMatch = false;
        message = `No products found for "${q}".`;
      } else {
        const tokens = Array.from(new Set(groups.flatMap((g) => g.tokens)));
        const phraseTokens = tokenize(q, { expand: false }).filter((t) => t.includes("_"));
        const allTokens = Array.from(new Set([...tokens, ...phraseTokens]));

        const lexical = this.bm25.search(allTokens);
        const semantic = this.vector.search(allTokens);
        strategy = lexical.length && semantic.length ? "hybrid" : lexical.length ? "lexical" : semantic.length ? "semantic" : "none";
        const fused = rrfFuse([lexical, semantic], [1, 0.9]);
        for (const { id, score } of fused) scoreMap.set(id, score);

        // AND semantics: prefer documents that match EVERY query word.
        const cands = fused.map((f) => this.byId.get(f.id)).filter(Boolean);
        const exact = cands.filter((p) => groups.every((g) => this._matchesGroup(p.id, g)));
        if (exact.length > 0) {
          candidateIds = new Set(exact.map((p) => p.id));
        } else if (groups.length > 1) {
          const cov = (p) => groups.filter((g) => this._matchesGroup(p.id, g)).length / groups.length;
          const best = cands.reduce((m, p) => Math.max(m, cov(p)), 0);
          candidateIds = new Set(cands.filter((p) => cov(p) >= best).map((p) => p.id));
          exactMatch = false;
          message = `No exact match for "${q}". Showing closest results.`;
        } else {
          candidateIds = new Set(cands.map((p) => p.id));
        }
      }
    }

    // Precise matches first (AND semantics where available).
    const allFiltered = this.products.filter((p) => this._matchesFilters(p, filters));
    const primary = candidateIds
      ? Array.from(candidateIds)
          .map((id) => this.byId.get(id))
          .filter(Boolean)
          .filter((p) => this._matchesFilters(p, filters))
      : allFiltered.slice();

    const sort = params.sort || (q ? "relevance" : "rating");
    // coverage = fraction of query words present in the document (rewards docs
    // that satisfy the whole query over docs matching only one common word).
    const coverage = (p) =>
      groups.length ? groups.filter((g) => this._matchesGroup(p.id, g)).length / groups.length : 0;
    const scoreOf = (p) => (scoreMap.get(p.id) || 0) + this._prior(p) + 0.04 * coverage(p);
    const sorters = {
      relevance: (a, b) => scoreOf(b) - scoreOf(a),
      price_asc: (a, b) => a.price - b.price,
      price_desc: (a, b) => b.price - a.price,
      rating: (a, b) => b.rating - a.rating || b.ratingCount - a.ratingCount,
      popularity: (a, b) => (b.ratingCount || 0) - (a.ratingCount || 0),
    };
    const sorter = sorters[sort] || sorters.relevance;
    primary.sort(sorter);

    // Google-style recall: for a real query we never return a near-empty page —
    // backfill with the next most relevant products from the whole catalogue.
    const target = Math.max(0, Number(params.minResults) || 200);
    const primaryIds = new Set(primary.map((p) => p.id));
    const showRelated = !!q && strategy !== "none";
    let combined = primary;
    if (showRelated && primary.length < target) {
      const related = allFiltered
        .filter((p) => !primaryIds.has(p.id))
        .sort((a, b) => (sort === "relevance" ? scoreOf(b) - scoreOf(a) : sorter(a, b)));
      combined = primary.concat(related);
    }

    const facets = this._facets(combined.slice(0, 300));
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.min(50, Math.max(1, Number(params.pageSize) || 12));
    const total = combined.length;
    const slice = combined.slice((page - 1) * pageSize, page * pageSize);
    const maxScore = slice.length ? scoreOf(slice[0]) : 1;

    const results = slice.map((p) => {
      const isRelated = showRelated && !primaryIds.has(p.id);
      return {
        id: p.id,
        title: p.title,
        brand: p.brand,
        category: p.category,
        categoryPath: p.categoryPath,
        price: p.price,
        mrp: p.mrp,
        currency: p.currency,
        rating: p.rating,
        ratingCount: p.ratingCount,
        inStock: p.inStock,
        tags: p.tags,
        image: p.image || null,
        images: p.images || [],
        score: Math.round((scoreOf(p) / (maxScore || 1)) * 1000) / 1000,
        aiScore: p.aiScore || null,
        reason: isRelated ? "You might also like" : this._reason(p, q),
        related: isRelated,
      };
    });

    return {
      query: q,
      corrected: fixes,
      strategy,
      exactMatch,
      message,
      suggestions: q && total === 0 ? this.suggest(q.slice(0, 10)) : [],
      total,
      related: showRelated ? Math.max(0, total - primary.length) : 0,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
      facets,
      results,
      tookMs: Date.now() - started,
    };
  }

  _reason(p, q) {
    if (!q) return null;
    const qTokens = new Set(tokenize(q, { expand: false }));
    const matched = (p.tags || []).filter((t) =>
      tokenize(t, { expand: false }).some((x) => qTokens.has(x))
    );
    if (matched.length) return `Matches: ${matched.slice(0, 3).join(", ")}`;
    return `Relevant ${p.category}`;
  }

  suggest(prefix, limit = 8) {
    return this.trie.suggest(prefix, limit).map((s) => s.word);
  }

  product(id) {
    return this.byId.get(id) || null;
  }

  similar(id, limit = 6) {
    const base = this.vector.similar(id, limit);
    return base.map((s) => ({ product: this.byId.get(s.id), score: Math.round(s.score * 1000) / 1000 }));
  }

  stats() {
    return {
      products: this.products.length,
      vocabulary: this.index.length,
      avgDocLength: Math.round(this.index.avgdl * 10) / 10,
    };
  }
}

function tokensOrEmpty(q) {
  return q || "";
}

module.exports = { SearchService, rrfFuse };
